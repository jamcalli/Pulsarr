import type {
  DeliveryResult,
  MediaNotification,
  NotificationTestResult,
  NotificationUser,
  PlexMobileStatus,
} from '@root/types/notification.types.js'
import { buildPlexGuid } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  type PlexMobileNotificationDeps,
  type PlexMobilePayload,
  sendPlexMobileNotification,
  sendPlexMobileTestNotification,
} from './plex-mobile.js'
import { timeTest } from './time-test.js'

interface PendingPlexNotification {
  user: NotificationUser
  notification: MediaNotification
  watchlistItemKey: string
  guid: string
  isBulkRelease: boolean
  createdAt: number
  settle: (result: DeliveryResult) => void
}

/** `queued` settles once Plex indexes the item and the push goes out, or the retry gives up. */
export type PlexMobileDelivery =
  | DeliveryResult
  | { queued: Promise<DeliveryResult> }

const STATUS_TEST_ERRORS: Record<
  Exclude<PlexMobileStatus, 'enabled'>,
  string
> = {
  disabled: 'Plex mobile notifications are turned off.',
  no_plex_pass: 'Plex mobile notifications need Plex Pass on the server.',
  not_configured:
    'Pulsarr has not checked for Plex Pass yet. Connect a Plex server first.',
}

const RETRY_INTERVAL_MS = 120_000
const INITIAL_RETRY_DELAY_MS = 60_000
const MAX_RETRY_AGE_MS = 10 * 60 * 1000

export class PlexMobileService {
  private readonly log: FastifyBaseLogger
  private readonly pendingQueue = new Map<string, PendingPlexNotification>()
  private retryTimer:
    | ReturnType<typeof setTimeout>
    | ReturnType<typeof setInterval>
    | null = null
  private isProcessingRetries = false

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_MOBILE')
  }

  private get notificationDeps(): PlexMobileNotificationDeps {
    return {
      logger: this.log,
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
      this.log.debug(
        'Plex Pass status not yet determined, so Plex mobile notifications are deferred',
      )
      return
    }
    if (!hasPlexPass) {
      this.log.debug(
        'Plex Pass not detected, so Plex mobile notifications are unavailable',
      )
      return
    }

    if (!this.isEnabled()) {
      this.log.debug('Plex mobile notifications are disabled in configuration')
      return
    }

    this.log.debug('Plex mobile notification service initialized')
  }

  shutdown(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.pendingQueue.size > 0) {
      this.log.info(
        `Shutting down with ${this.pendingQueue.size} pending notifications discarded`,
      )
    }
    for (const pending of this.pendingQueue.values()) {
      pending.settle({ ok: false, reason: 'discarded at shutdown' })
    }
    this.pendingQueue.clear()
  }

  triggerRetryProcessing(): void {
    if (this.pendingQueue.size === 0) return
    void this.processRetryQueue()
  }

  async sendNotification(
    user: NotificationUser,
    notification: MediaNotification,
    watchlistItemKey: string,
    guid: string,
    isBulkRelease: boolean,
  ): Promise<PlexMobileDelivery> {
    if (!this.isEnabled()) {
      return { ok: false, reason: 'Plex mobile notifications disabled' }
    }
    if (!user.notify_plex_mobile) {
      return { ok: false, reason: 'user has Plex mobile notifications off' }
    }

    const plexToken = this.fastify.config.plexTokens?.[0]
    const serverMachineId = this.fastify.plexServerService.getServerMachineId()
    if (!plexToken || !serverMachineId) {
      return { ok: false, reason: 'not connected to a Plex server' }
    }

    const plexUserId =
      await this.fastify.plexServerService.resolveUserPlexId(user)
    if (plexUserId === null) {
      return { ok: false, reason: 'no matching Plex account' }
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

    const episode = notification.episodeDetails
    const queueKey = [
      guid,
      user.id,
      episode?.seasonNumber,
      episode?.episodeNumber,
    ].join(':')
    const { promise: queued, resolve: settle } =
      Promise.withResolvers<DeliveryResult>()
    this.pendingQueue.get(queueKey)?.settle({
      ok: false,
      reason: 'replaced by a newer queued notification',
    })
    this.pendingQueue.set(queueKey, {
      user,
      notification,
      watchlistItemKey,
      guid,
      isBulkRelease,
      createdAt: Date.now(),
      settle,
    })
    this.log.debug(
      { queueKey, title: notification.title, username: user.name },
      'Plex mobile notification queued until Plex indexes the content',
    )
    this.ensureRetryTimer()
    return { queued }
  }

  testNotification(
    user: Pick<NotificationUser, 'id' | 'plex_uuid'>,
  ): Promise<NotificationTestResult> {
    return timeTest(async () => {
      const status = this.getStatus()
      if (status !== 'enabled') {
        return { success: false, error: STATUS_TEST_ERRORS[status] }
      }

      const deps = this.notificationDeps
      if (!deps.plexToken || !deps.serverMachineId) {
        return {
          success: false,
          error: 'Pulsarr is not connected to a Plex server yet.',
        }
      }

      const plexUserId =
        await this.fastify.plexServerService.resolveUserPlexId(user)
      if (plexUserId === null) {
        return {
          success: false,
          error: 'This user is not matched to a Plex account on your server.',
        }
      }

      return sendPlexMobileTestNotification(plexUserId, deps)
    })
  }

  private async resolveRatingKey(
    plexGuid: string,
    mediaType: 'movie' | 'show',
    episodeDetails?: MediaNotification['episodeDetails'],
    isBulkRelease?: boolean,
  ): Promise<{ ratingKey: string; episodeCount?: number } | null> {
    const results = await this.fastify.plexServerService.searchByGuid(plexGuid)
    if (results.length === 0) return null

    const ratingKey = results[0].ratingKey

    if (mediaType === 'movie') {
      return { ratingKey }
    }

    const showMeta = await this.fastify.plexServerService.getShowMetadata(
      ratingKey,
      true,
    )
    const seasons = showMeta?.MediaContainer.Metadata?.[0]?.Children?.Metadata
    if (!seasons) return null

    const targetSeason = episodeDetails?.seasonNumber

    if (targetSeason == null) {
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

    if (isBulkRelease) {
      return { ratingKey: season.ratingKey, episodeCount: season.leafCount }
    }

    // includeChildren=1 does not return episodes on a season, so episodes come from /children
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

  private async sendResolved(
    notification: MediaNotification,
    resolved: { ratingKey: string; episodeCount?: number },
    userIds: number[],
    isBulkRelease: boolean,
  ): Promise<DeliveryResult> {
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
      year: undefined,
      seasonNumber: notification.episodeDetails?.seasonNumber,
      episodeNumber:
        payloadType === 'episode'
          ? notification.episodeDetails?.episodeNumber
          : undefined,
      episodeCount: resolved.episodeCount,
      ratingKey: resolved.ratingKey,
      userIds,
    }

    return sendPlexMobileNotification(payload, this.notificationDeps)
  }

  /** Call on SSE disconnect so queued items still retry without content-scanned events. */
  startRetryPolling(): void {
    if (this.pendingQueue.size === 0) return
    this.ensureRetryTimer()
  }

  private ensureRetryTimer(): void {
    if (this.retryTimer) return
    // A connected SSE stream drives retries through triggerRetryProcessing instead
    if (this.fastify.plexServerService.isSSEConnected()) return
    this.retryTimer = setTimeout(() => {
      void this.processRetryQueue()
      this.retryTimer = setInterval(() => {
        void this.processRetryQueue()
      }, RETRY_INTERVAL_MS)
    }, INITIAL_RETRY_DELAY_MS)
  }

  /** Resolves why a queued push must not go out now, or null when it may. */
  private async sendTimeOptOut(userId: number): Promise<string | null> {
    if (!this.isEnabled()) return 'Plex mobile turned off'
    const user = await this.fastify.db.getUser(userId)
    return user?.notify_plex_mobile ? null : 'user turned off Plex mobile'
  }

  private async processRetryQueue(): Promise<void> {
    if (this.isProcessingRetries) return
    this.isProcessingRetries = true

    try {
      if (this.pendingQueue.size === 0) {
        if (this.retryTimer) {
          clearTimeout(this.retryTimer)
          this.retryTimer = null
        }
        return
      }

      const now = Date.now()

      for (const [key, pending] of this.pendingQueue) {
        try {
          if (now - pending.createdAt > MAX_RETRY_AGE_MS) {
            pending.settle({
              ok: false,
              reason: 'Plex did not index the content in time',
            })
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

          if (!resolved) continue

          const optOut = await this.sendTimeOptOut(pending.user.id)
          if (optOut) {
            pending.settle({ ok: false, reason: optOut })
            this.pendingQueue.delete(key)
            continue
          }

          const plexUserId =
            await this.fastify.plexServerService.resolveUserPlexId(pending.user)
          if (plexUserId === null) {
            pending.settle({ ok: false, reason: 'no matching Plex account' })
            this.pendingQueue.delete(key)
            continue
          }

          const result = await this.sendResolved(
            pending.notification,
            resolved,
            [plexUserId],
            pending.isBulkRelease,
          )

          if (result.ok) {
            pending.settle(result)
            this.pendingQueue.delete(key)
          } else {
            this.log.debug(
              { key, title: pending.notification.title, reason: result.reason },
              'Plex mobile retry send failed, retrying next cycle',
            )
          }
        } catch (error) {
          this.log.error(
            { error, key, title: pending.notification.title },
            'Unexpected error processing retry item, retrying next cycle',
          )
        }
      }

      if (this.pendingQueue.size === 0 && this.retryTimer) {
        clearTimeout(this.retryTimer)
        this.retryTimer = null
      }
    } finally {
      this.isProcessingRetries = false
    }
  }
}
