/**
 * Tautulli Service
 *
 * Orchestrates Tautulli integration for mobile push notifications.
 * This service coordinates the notifier, queue, and matching domains.
 */

import type { User } from '@root/types/config.types.js'
import type { MediaNotification } from '@root/types/discord.types.js'
import type {
  PendingNotification,
  TautulliApiResponse,
  TautulliConfig,
  TautulliMetadata,
  TautulliNotificationRequest,
  TautulliNotifier,
} from '@root/types/tautulli.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  createItemMatcher,
  getMetadata,
  getPosterUrl,
  getRecentlyAdded,
  type MetadataFetcherDeps,
  searchByGuid,
} from './matching/index.js'
// Domain imports
import {
  ensureUserNotifier,
  getNotifiers,
  type NotifierManagerDeps,
  removeUserNotifier,
  syncUserNotifiers,
  type TautulliEnabledUser,
} from './notifiers/index.js'
import {
  createPollingState,
  type PollingState,
  type QueueDeps,
  queueNotification,
  startPolling,
  stopPolling,
} from './queue/index.js'

const PLEXMOBILEAPP_AGENT_ID = 26

export class TautulliService {
  private db: DatabaseService
  private isInitialized = false
  private readonly log: FastifyBaseLogger

  // Queue state
  private pendingNotifications = new Map<string, PendingNotification>()
  private pollingState: PollingState

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'TAUTULLI')
    this.db = fastify.db
    this.pollingState = createPollingState()
  }

  private get config(): TautulliConfig {
    return {
      url: this.fastify.config.tautulliUrl || '',
      apiKey: this.fastify.config.tautulliApiKey || '',
      enabled: this.fastify.config.tautulliEnabled || false,
    }
  }

  private get isActive(): boolean {
    return this.isInitialized && this.config.enabled
  }

  // ============================================
  // API Communication
  // ============================================

  private async apiCall<T = unknown>(
    cmd: string,
    params: Record<string, unknown> = {},
  ): Promise<TautulliApiResponse<T>> {
    const url = new URL(`${this.config.url}/api/v2`)

    const searchParams = new URLSearchParams({
      apikey: this.config.apiKey,
      cmd,
      ...Object.entries(params).reduce<Record<string, string>>(
        (acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value)
          }
          return acc
        },
        {},
      ),
    })

    url.search = searchParams.toString()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(
          `Tautulli API error: ${response.status} ${response.statusText}`,
        )
      }

      return response.json() as Promise<TautulliApiResponse<T>>
    } catch (error) {
      clearTimeout(timeout)
      throw error
    }
  }

  // ============================================
  // Dependency Factories
  // ============================================

  private get notifierDeps(): NotifierManagerDeps {
    return {
      apiCall: this.apiCall.bind(this),
      db: this.db,
      log: this.log,
      agentId: PLEXMOBILEAPP_AGENT_ID,
    }
  }

  private get metadataFetcherDeps(): MetadataFetcherDeps {
    return {
      apiCall: this.apiCall.bind(this),
      log: this.log,
      isActive: () => this.isActive,
    }
  }

  private get queueDeps(): QueueDeps {
    return {
      log: this.log,
      db: this.db,
      isActive: () => this.isActive,
      getNotifiers: () => this.getNotifiersInternal(),
      notifierDeps: this.notifierDeps,
      findMatchingItem: this.findMatchingItem.bind(this),
      getRecentlyAdded: (count?: number) =>
        this.getRecentlyAddedInternal(count ?? 100),
      sendTautulliNotification: this.sendTautulliNotification.bind(this),
      startPolling: () => this.startPollingInternal(),
    }
  }

  // ============================================
  // Internal Wrappers
  // ============================================

  private async getNotifiersInternal(): Promise<TautulliNotifier[]> {
    return getNotifiers(this.notifierDeps)
  }

  private async getRecentlyAddedInternal(count: number) {
    return getRecentlyAdded(count, this.metadataFetcherDeps)
  }

  private get findMatchingItem() {
    return createItemMatcher({
      log: this.log,
      getMetadata: (ratingKey: string) =>
        getMetadata(ratingKey, this.metadataFetcherDeps),
    })
  }

  private startPollingInternal(): void {
    startPolling(this.pollingState, {
      log: this.log,
      isActive: () => this.isActive,
      pendingNotifications: this.pendingNotifications,
      findMatchingItem: this.findMatchingItem,
      getRecentlyAdded: (count?: number) =>
        this.getRecentlyAddedInternal(count ?? 100),
      sendTautulliNotification: this.sendTautulliNotification.bind(this),
    })
  }

  private stopPollingInternal(): void {
    stopPolling(this.pollingState, this.log)
  }

  private async sendTautulliNotification(
    notifierId: number,
    ratingKey: string,
  ): Promise<boolean> {
    try {
      const response = await this.apiCall('notify_recently_added', {
        rating_key: ratingKey,
        notifier_id: notifierId,
      })

      const isSuccess = response?.response?.result === 'success'

      if (!isSuccess) {
        this.log.warn(
          {
            notifierId,
            ratingKey,
            response: response?.response,
            message: response?.response?.message,
          },
          'Tautulli notification API call failed',
        )
      }

      return isSuccess
    } catch (error) {
      this.log.error(
        {
          error: error instanceof Error ? error.message : error,
          notifierId,
          ratingKey,
        },
        'Exception during Tautulli notification API call',
      )
      throw error
    }
  }

  // ============================================
  // Lifecycle
  // ============================================

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    if (!this.config.url || !this.config.apiKey) {
      this.log.warn('Tautulli URL or API key not configured')
      return
    }

    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const isConnected = await this.testConnection()
        if (!isConnected) {
          throw new Error('Failed to connect to Tautulli')
        }

        this.log.info('Tautulli integration enabled successfully')
        this.isInitialized = true
        return
      } catch (error) {
        if (attempt === maxRetries) {
          this.log.error(
            { error },
            'Failed to initialize Tautulli integration after all retries',
          )
        } else {
          this.log.warn(
            { error, attempt, maxRetries },
            'Tautulli initialization failed, retrying...',
          )
          await new Promise((resolve) => setTimeout(resolve, 5000 * attempt))
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    this.stopPollingInternal()
    this.isInitialized = false
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.apiCall<{ result: string }>('arnold')
      return response?.response?.result === 'success'
    } catch {
      return false
    }
  }

  // ============================================
  // Public API - Notifiers
  // ============================================

  async syncUserNotifiers(): Promise<void> {
    if (!this.isActive) return
    return syncUserNotifiers(this.notifierDeps)
  }

  async removeUserNotifier(userId: number): Promise<void> {
    return removeUserNotifier(userId, this.notifierDeps)
  }

  // ============================================
  // Public API - Metadata
  // ============================================

  async getMetadata(ratingKey: string): Promise<TautulliMetadata | null> {
    return getMetadata(ratingKey, this.metadataFetcherDeps)
  }

  async searchByGuid(guid: string): Promise<TautulliMetadata | null> {
    return searchByGuid(guid, this.metadataFetcherDeps)
  }

  // ============================================
  // Public API - Notifications
  // ============================================

  async queueNotification(
    guid: string,
    mediaType: 'movie' | 'show' | 'episode',
    interestedUsers: Array<{
      userId: number
      username: string
      notifierId: number
    }>,
    metadata: {
      title: string
      watchlistItemId: number
      watchlistItemKey?: string
      seasonNumber?: number
      episodeNumber?: number
    },
  ): Promise<void> {
    return queueNotification(
      this.pendingNotifications,
      guid,
      mediaType,
      interestedUsers,
      metadata,
      this.queueDeps,
    )
  }

  async sendMediaNotification(
    user: User,
    notification: MediaNotification,
    watchlistItemId?: number,
    guid?: string,
    watchlistItemKey?: string,
  ): Promise<boolean> {
    if (!this.isActive || !watchlistItemId) {
      return false
    }

    if (!user.notify_tautulli) {
      this.log.debug(`User ${user.name} has Tautulli notifications disabled`)
      return false
    }

    if (!guid) {
      this.log.error(
        `No GUID provided for Tautulli notification - user: ${user.name}, title: ${notification.title}`,
      )
      return false
    }

    const tautulliUser = await this.db.getUser(user.id)

    let mediaType: 'movie' | 'show' | 'episode' = notification.type
    if (notification.type === 'show' && notification.episodeDetails) {
      mediaType =
        notification.episodeDetails.episodeNumber !== undefined
          ? 'episode'
          : 'show'
    }

    await this.queueNotification(
      guid,
      mediaType,
      [
        {
          userId: user.id,
          username: user.name,
          notifierId: tautulliUser?.tautulli_notifier_id || 0,
        },
      ],
      {
        title: notification.title,
        watchlistItemId,
        watchlistItemKey,
        seasonNumber: notification.episodeDetails?.seasonNumber,
        episodeNumber: notification.episodeDetails?.episodeNumber,
      },
    )

    return true
  }

  async notifyUsersNewContent(
    users: TautulliEnabledUser[],
    mediaItem: {
      ratingKey?: string
      guid?: string
      title?: string
      type?: 'movie' | 'show' | 'episode'
    },
    _watchlistItemId: number,
  ): Promise<{ success: number; failed: number }> {
    if (!this.isActive) {
      return { success: 0, failed: users.length }
    }

    const startTime = Date.now()
    let success = 0
    let failed = 0

    const existingNotifiers = await this.getNotifiersInternal()

    const eligibleUsers: Array<
      TautulliEnabledUser & { tautulli_notifier_id: number }
    > = []

    for (const user of users) {
      if (!user.tautulli_notifier_id) {
        this.log.info(
          { user: user.username },
          'User has no Tautulli notifier, creating one now',
        )

        try {
          const notifierId = await ensureUserNotifier(
            user,
            existingNotifiers,
            this.notifierDeps,
          )
          if (notifierId) {
            eligibleUsers.push({
              ...user,
              tautulli_notifier_id: notifierId,
            })
          } else {
            failed++
            this.log.warn(
              { user: user.username },
              'Failed to create Tautulli notifier for user',
            )
          }
        } catch (error) {
          failed++
          this.log.error(
            { error, user: user.username },
            'Error creating Tautulli notifier for user',
          )
        }
      } else {
        eligibleUsers.push({
          ...user,
          tautulli_notifier_id: user.tautulli_notifier_id,
        })
      }
    }

    if (eligibleUsers.length === 0) {
      return { success: 0, failed: users.length }
    }

    let metadata: TautulliMetadata | null = null

    if (mediaItem.ratingKey) {
      metadata = await this.getMetadata(mediaItem.ratingKey)
    } else if (mediaItem.guid) {
      metadata = await this.searchByGuid(mediaItem.guid)
    }

    if (!metadata) {
      this.log.warn(
        { mediaItem },
        'Could not find media in Tautulli for bulk notification',
      )
      return { success: 0, failed: users.length }
    }

    let subject = `${metadata.title} is now available!`
    let body = `Your watchlist item "${metadata.title}" has been added to the library.`

    if (metadata.media_type === 'episode' && metadata.grandparent_title) {
      subject = `New episode of ${metadata.grandparent_title} available!`
      body = `${metadata.grandparent_title} - ${metadata.parent_title} - ${metadata.title} has been added to the library.`
    }

    if (metadata.summary) {
      body += `\n\n${metadata.summary}`
    }

    const posterUrl = metadata.thumb
      ? getPosterUrl(metadata.thumb, metadata.rating_key, this.config)
      : undefined

    const ratingKey = metadata.rating_key

    const notificationPromises = eligibleUsers.map(async (user) => {
      try {
        const notificationReq: TautulliNotificationRequest = {
          notifier_id: user.tautulli_notifier_id,
          subject,
          body,
          poster_url: posterUrl,
          rating_key: ratingKey,
        }

        const response = await this.apiCall('notify', { ...notificationReq })
        const isSuccess = response?.response?.result === 'success'

        if (isSuccess) {
          success++
        } else {
          failed++
          this.log.warn(
            { user: user.username, error: response?.response?.message },
            'Failed to send Tautulli notification in bulk',
          )
        }
      } catch (error) {
        failed++
        this.log.error(
          { error, user: user.username },
          'Error sending Tautulli notification in bulk',
        )
      }
    })

    await Promise.all(notificationPromises)

    const duration = Date.now() - startTime
    this.log.info(
      { success, failed, title: metadata.title, duration },
      'Completed bulk Tautulli notifications',
    )

    return { success, failed }
  }

  // ============================================
  // Public API - Status
  // ============================================

  async getUserNotificationHistory(
    _userId: number,
    _limit = 50,
  ): Promise<
    Array<{
      id: number
      watchlist_item_id: number
      notifier_id: number | null
      success: boolean
      error_message: string | null
      notified_at: string
    }>
  > {
    return []
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  getStatus(): 'running' | 'disabled' {
    if (this.isActive) {
      return 'running'
    }
    return 'disabled'
  }

  getConfig(): TautulliConfig {
    return { ...this.config }
  }
}
