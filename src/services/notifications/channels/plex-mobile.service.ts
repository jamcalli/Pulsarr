/**
 * Plex Mobile Service
 *
 * Owns the full Plex mobile notification flow:
 * - Rating key resolution (movie/episode/season)
 * - User ID mapping (username → numeric Plex ID)
 * - In-memory retry queue for Plex indexing delay
 * - Delegates to the pure sendPlexMobileNotification function
 */

import type { User } from '@root/types/config.types.js'
import type { MediaNotification } from '@root/types/discord.types.js'
import type { PlexUser } from '@root/types/plex-server.types.js'
import { buildPlexGuid } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  type PlexMobileNotificationDeps,
  type PlexMobilePayload,
  sendPlexMobileNotification,
} from './plex-mobile.js'

export type PlexMobileStatus =
  | 'enabled'
  | 'disabled'
  | 'no_plex_pass'
  | 'not_configured'

interface PendingPlexNotification {
  user: User
  notification: MediaNotification
  watchlistItemKey: string
  guid: string
  isBulkRelease: boolean
  createdAt: number
}

const RETRY_INTERVAL_MS = 30_000
const MAX_RETRY_AGE_MS = 10 * 60 * 1000

export class PlexMobileService {
  private readonly log: FastifyBaseLogger
  private readonly pendingQueue = new Map<string, PendingPlexNotification>()
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private isProcessingRetries = false
  private plexUsersCache: PlexUser[] | null = null
  private plexUsersCacheTimestamp = 0
  private readonly PLEX_USERS_CACHE_TTL = 30 * 60 * 1000

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_MOBILE')
  }

  private get notificationDeps(): PlexMobileNotificationDeps {
    return {
      log: this.log,
      plexToken: this.fastify.config.plexTokens?.[0] ?? '',
      serverMachineId:
        this.fastify.plexServerService.getServerMachineId() ?? '',
      serverName: this.fastify.plexServerService.getServerName() ?? 'Plex',
    }
  }

  isEnabled(): boolean {
    return this.fastify.config.plexMobileEnabled === true
  }

  getStatus(): PlexMobileStatus {
    const hasPlexPass = this.fastify.plexServerService.getHasPlexPass()
    if (hasPlexPass === null) {
      return 'not_configured'
    }
    if (!hasPlexPass) {
      return 'no_plex_pass'
    }
    return this.isEnabled() ? 'enabled' : 'disabled'
  }

  async initialize(): Promise<void> {
    const hasPlexPass = this.fastify.plexServerService.getHasPlexPass()
    if (hasPlexPass === null) {
      this.log.info(
        'Plex Pass status not yet determined — Plex mobile notifications deferred',
      )
      return
    }
    if (!hasPlexPass) {
      this.log.info(
        'Plex Pass not detected — Plex mobile notifications unavailable',
      )
      return
    }

    if (!this.isEnabled()) {
      this.log.info('Plex mobile notifications are disabled in configuration')
      return
    }

    this.log.info('Plex mobile notification service initialized')
  }

  shutdown(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
    if (this.pendingQueue.size > 0) {
      this.log.info(
        `Shutting down with ${this.pendingQueue.size} pending notifications discarded`,
      )
    }
    this.pendingQueue.clear()
    this.plexUsersCache = null
  }

  // ---------------------------------------------------------------------------
  // Public entry point — called from notification orchestration
  // ---------------------------------------------------------------------------

  async sendMediaNotification(
    user: User,
    notification: MediaNotification,
    watchlistItemKey: string,
    guid: string,
    isBulkRelease: boolean,
  ): Promise<boolean> {
    if (!this.isEnabled()) return false
    if (!user.notify_plex_mobile) return false

    const plexToken = this.fastify.config.plexTokens?.[0]
    const serverMachineId = this.fastify.plexServerService.getServerMachineId()
    if (!plexToken || !serverMachineId) {
      this.log.error(
        { hasToken: !!plexToken, hasMachineId: !!serverMachineId },
        'Missing critical deps for Plex mobile notification — skipping',
      )
      return false
    }

    const plexUserId = await this.resolveUserPlexId(user.name, user.id)
    if (plexUserId === null) {
      this.log.warn(
        { username: user.name },
        'Could not resolve numeric Plex user ID — skipping notification',
      )
      return false
    }

    const plexGuid = buildPlexGuid(
      notification.type === 'movie' ? 'movie' : 'show',
      watchlistItemKey,
    )

    const resolved = await this.resolveRatingKey(
      plexGuid,
      notification.type,
      notification.episodeDetails,
      isBulkRelease,
    )

    if (resolved) {
      return this.sendResolved(
        notification,
        resolved,
        [plexUserId],
        isBulkRelease,
      )
    }

    // Not found yet — queue for retry
    const queueKey = `${guid}:${user.id}`
    this.pendingQueue.set(queueKey, {
      user,
      notification,
      watchlistItemKey,
      guid,
      isBulkRelease,
      createdAt: Date.now(),
    })
    this.log.info(
      { queueKey, title: notification.title, username: user.name },
      'Plex mobile notification queued — content not yet indexed in Plex',
    )
    this.ensureRetryTimer()
    return false
  }

  // ---------------------------------------------------------------------------
  // Rating key resolution
  // ---------------------------------------------------------------------------

  private async resolveRatingKey(
    plexGuid: string,
    mediaType: 'movie' | 'show',
    episodeDetails?: MediaNotification['episodeDetails'],
    isBulkRelease?: boolean,
  ): Promise<{ ratingKey: string; episodeCount?: number } | null> {
    const results = await this.fastify.plexServerService.searchByGuid(plexGuid)
    if (results.length === 0) return null

    const ratingKey = results[0].ratingKey

    // Movie — single call, done
    if (mediaType === 'movie') {
      return { ratingKey }
    }

    // Show — drill into seasons via includeChildren on show metadata
    const showMeta = await this.fastify.plexServerService.getShowMetadata(
      ratingKey,
      true,
    )
    const seasons = showMeta?.MediaContainer.Metadata?.[0]?.Children?.Metadata
    if (!seasons) return null

    const targetSeason = episodeDetails?.seasonNumber

    if (targetSeason == null) {
      // No season info — link to the show itself
      return { ratingKey }
    }

    const season = seasons.find((s) => s.index === targetSeason)
    if (!season) {
      this.log.debug(
        { targetSeason, availableSeasons: seasons.map((s) => s.index) },
        'Season not found in show metadata',
      )
      return null
    }

    // Bulk release — link to the season
    if (isBulkRelease) {
      return { ratingKey: season.ratingKey, episodeCount: season.leafCount }
    }

    // Single episode — use /children endpoint (includeChildren=1 doesn't work on seasons)
    const targetEpisode = episodeDetails?.episodeNumber
    if (targetEpisode == null) {
      return { ratingKey: season.ratingKey }
    }

    const childrenResponse =
      await this.fastify.plexServerService.getMetadataChildren(season.ratingKey)
    const episodes = childrenResponse?.MediaContainer.Metadata
    if (!episodes) return null

    const episode = episodes.find((e) => e.index === targetEpisode)
    if (!episode) {
      this.log.debug(
        { targetEpisode, targetSeason },
        'Episode not found in season children',
      )
      return null
    }

    return { ratingKey: episode.ratingKey }
  }

  // ---------------------------------------------------------------------------
  // User ID mapping
  // ---------------------------------------------------------------------------

  private async resolveUserPlexId(
    username: string,
    userId: number,
  ): Promise<number | null> {
    // Admin user — use the captured admin ID
    const primaryUser = await this.fastify.db.getPrimaryUser()
    if (primaryUser && primaryUser.id === userId) {
      const adminId = this.fastify.plexServerService.getAdminPlexId()
      if (adminId !== null) return adminId
    }

    // Friend user — lookup from cached getPlexUsers()
    const plexUsers = await this.getCachedPlexUsers()
    const match = plexUsers.find(
      (pu) =>
        pu.username.toLowerCase() === username.toLowerCase() ||
        pu.title.toLowerCase() === username.toLowerCase(),
    )

    if (match) {
      const numericId = Number(match.id)
      return Number.isNaN(numericId) ? null : numericId
    }

    return null
  }

  private async getCachedPlexUsers(): Promise<PlexUser[]> {
    if (
      this.plexUsersCache &&
      Date.now() - this.plexUsersCacheTimestamp < this.PLEX_USERS_CACHE_TTL
    ) {
      return this.plexUsersCache
    }

    this.plexUsersCache = await this.fastify.plexServerService.getPlexUsers()
    this.plexUsersCacheTimestamp = Date.now()
    return this.plexUsersCache
  }

  // ---------------------------------------------------------------------------
  // Send resolved notification
  // ---------------------------------------------------------------------------

  private async sendResolved(
    notification: MediaNotification,
    resolved: { ratingKey: string; episodeCount?: number },
    userIds: number[],
    isBulkRelease: boolean,
  ): Promise<boolean> {
    let payloadType: PlexMobilePayload['type']
    if (notification.type === 'movie') {
      payloadType = 'movie'
    } else if (isBulkRelease) {
      payloadType = 'season'
    } else {
      payloadType = 'episode'
    }

    const payload: PlexMobilePayload = {
      type: payloadType,
      title:
        payloadType === 'episode'
          ? (notification.episodeDetails?.title ?? notification.title)
          : notification.title,
      grandparentTitle:
        payloadType !== 'movie' ? notification.title : undefined,
      year: undefined, // Year not available in MediaNotification
      seasonNumber: notification.episodeDetails?.seasonNumber,
      episodeNumber: notification.episodeDetails?.episodeNumber,
      episodeCount: resolved.episodeCount,
      ratingKey: resolved.ratingKey,
      userIds,
    }

    return sendPlexMobileNotification(payload, this.notificationDeps)
  }

  // ---------------------------------------------------------------------------
  // Retry queue
  // ---------------------------------------------------------------------------

  private ensureRetryTimer(): void {
    if (this.retryTimer) return
    this.retryTimer = setInterval(() => {
      void this.processRetryQueue()
    }, RETRY_INTERVAL_MS)
  }

  private async processRetryQueue(): Promise<void> {
    if (this.isProcessingRetries) return
    this.isProcessingRetries = true

    try {
      if (this.pendingQueue.size === 0) {
        if (this.retryTimer) {
          clearInterval(this.retryTimer)
          this.retryTimer = null
        }
        return
      }

      const now = Date.now()

      for (const [key, pending] of this.pendingQueue) {
        // Expired
        if (now - pending.createdAt > MAX_RETRY_AGE_MS) {
          this.log.warn(
            { key, title: pending.notification.title },
            'Plex mobile notification expired after max retry age',
          )
          this.pendingQueue.delete(key)
          continue
        }

        const plexGuid = buildPlexGuid(
          pending.notification.type === 'movie' ? 'movie' : 'show',
          pending.watchlistItemKey,
        )

        const resolved = await this.resolveRatingKey(
          plexGuid,
          pending.notification.type,
          pending.notification.episodeDetails,
          pending.isBulkRelease,
        )

        if (!resolved) continue // Still not indexed, try next cycle

        const plexUserId = await this.resolveUserPlexId(
          pending.user.name,
          pending.user.id,
        )
        if (plexUserId === null) {
          this.log.warn(
            { key, username: pending.user.name },
            'Could not resolve Plex user ID during retry — dropping notification',
          )
          this.pendingQueue.delete(key)
          continue
        }

        const sent = await this.sendResolved(
          pending.notification,
          resolved,
          [plexUserId],
          pending.isBulkRelease,
        )

        if (sent) {
          this.log.info(
            { key, title: pending.notification.title },
            'Plex mobile notification sent on retry',
          )
          this.pendingQueue.delete(key)
        } else {
          this.log.warn(
            { key, title: pending.notification.title },
            'Plex mobile notification send failed on retry — will retry next cycle',
          )
        }
      }

      // Stop timer if queue is empty
      if (this.pendingQueue.size === 0 && this.retryTimer) {
        clearInterval(this.retryTimer)
        this.retryTimer = null
      }
    } finally {
      this.isProcessingRetries = false
    }
  }
}
