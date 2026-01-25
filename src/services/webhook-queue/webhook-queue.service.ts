/**
 * Webhook Queue Service
 *
 * Orchestrates webhook batching and processing for Sonarr/Radarr notifications.
 * Consolidates queue state management, episode detection, and pending webhook handling.
 */

import type { WebhookQueue } from '@root/types/webhook.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  clearAllTimeouts,
  isEpisodeAlreadyQueued,
  type QueueManagerDeps,
} from './batching/index.js'
import {
  checkForUpgrade,
  type EpisodeCheckerDeps,
  fetchExpectedEpisodeCount,
  isRecentEpisode,
  isSeasonComplete,
  type SeasonCompletionDeps,
  type UpgradeTrackerDeps,
} from './detection/index.js'
import {
  cleanupExpiredWebhooks,
  type PendingStoreDeps,
  type PendingWebhookParams,
  processPendingWebhooks,
  queuePendingWebhook,
  type RetryProcessorDeps,
} from './persistence/index.js'
import {
  processQueuedWebhooks,
  type QueueProcessorDeps,
} from './processing/index.js'

export interface WebhookQueueConfig {
  retryInterval: number
  maxAge: number
  cleanupInterval: number
}

export class WebhookQueueService {
  private readonly log: FastifyBaseLogger
  private readonly _queue: WebhookQueue = {}
  private readonly _config: WebhookQueueConfig
  private _isRunning = false
  private _processingState = {
    processingWebhooks: false,
    cleaningUp: false,
  }

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    config?: Partial<WebhookQueueConfig>,
  ) {
    this.log = createServiceLogger(baseLog, 'WEBHOOK_QUEUE')
    this._config = {
      retryInterval: config?.retryInterval ?? 20,
      maxAge: config?.maxAge ?? 10,
      cleanupInterval: config?.cleanupInterval ?? 60,
    }
  }

  /**
   * Get the webhook queue
   */
  get queue(): WebhookQueue {
    return this._queue
  }

  /**
   * Get the configuration
   */
  get config(): WebhookQueueConfig {
    return this._config
  }

  /**
   * Build deps for queue manager operations
   */
  private get queueManagerDeps(): QueueManagerDeps {
    return { logger: this.log }
  }

  /**
   * Build deps for episode checker operations
   */
  private get episodeCheckerDeps(): EpisodeCheckerDeps {
    return {
      logger: this.log,
      newEpisodeThreshold: this.fastify.config.newEpisodeThreshold,
    }
  }

  /**
   * Build deps for upgrade tracker operations
   */
  private get upgradeTrackerDeps(): UpgradeTrackerDeps {
    return {
      logger: this.log,
      queue: this._queue,
      upgradeBufferTime: this.fastify.config.upgradeBufferTime,
    }
  }

  /**
   * Build deps for season completion detection
   */
  private get seasonCompletionDeps(): SeasonCompletionDeps {
    return {
      logger: this.log,
      queue: this._queue,
      getSeriesByTvdbId: (tvdbId) =>
        this.fastify.sonarrManager.getSeriesByTvdbIdFromAny(tvdbId),
    }
  }

  /**
   * Build deps for pending store operations
   */
  private get pendingStoreDeps(): PendingStoreDeps {
    return {
      db: this.fastify.db,
      logger: this.log,
      maxAgeMinutes: this._config.maxAge,
    }
  }

  /**
   * Build deps for queue processor operations
   */
  private get queueProcessorDeps(): QueueProcessorDeps {
    return {
      logger: this.log,
      queue: this._queue,
      notifications: this.fastify.notifications,
      episodeCheckerDeps: this.episodeCheckerDeps,
      pendingStoreDeps: this.pendingStoreDeps,
    }
  }

  /**
   * Build deps for retry processor operations
   */
  private get retryProcessorDeps(): RetryProcessorDeps {
    const plexLabelSyncService = this.fastify.plexLabelSyncService
    return {
      db: this.fastify.db,
      logger: this.log,
      notifications: this.fastify.notifications,
      plexLabelSyncEnabled: this.fastify.config.plexLabelSync?.enabled ?? false,
      syncLabelsOnWebhook: plexLabelSyncService
        ? (payload) =>
            plexLabelSyncService.syncLabelsOnWebhook(payload).then(() => {})
        : null,
    }
  }

  /**
   * Check if an episode is already queued
   */
  isEpisodeAlreadyQueued(
    tvdbId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): boolean {
    return isEpisodeAlreadyQueued(
      tvdbId,
      seasonNumber,
      episodeNumber,
      this._queue,
    )
  }

  /**
   * Check if an episode aired recently (within configured threshold)
   */
  isRecentEpisode(airDateUtc: string): boolean {
    return isRecentEpisode(airDateUtc, this.episodeCheckerDeps)
  }

  /**
   * Process queued webhooks for a show/season
   */
  async processQueuedWebhooks(
    tvdbId: string,
    seasonNumber: number,
  ): Promise<void> {
    return processQueuedWebhooks(tvdbId, seasonNumber, this.queueProcessorDeps)
  }

  /**
   * Queue a pending webhook for later processing
   */
  async queuePendingWebhook(params: PendingWebhookParams): Promise<void> {
    return queuePendingWebhook(params, this.pendingStoreDeps)
  }

  /**
   * Check for upgrade in progress
   */
  async checkForUpgrade(
    tvdbId: string,
    seasonNumber: number,
    episodeNumber: number,
    isUpgrade: boolean,
    instanceId: number | null,
  ): Promise<boolean> {
    return checkForUpgrade(
      tvdbId,
      seasonNumber,
      episodeNumber,
      isUpgrade,
      instanceId,
      this.upgradeTrackerDeps,
    )
  }

  /**
   * Fetch and cache the expected episode count for a season
   * Returns the expected count or null if unable to determine
   */
  async fetchExpectedEpisodeCount(
    tvdbId: string,
    seasonNumber: number,
  ): Promise<number | null> {
    return fetchExpectedEpisodeCount(
      tvdbId,
      seasonNumber,
      this.seasonCompletionDeps,
    )
  }

  /**
   * Check if all expected episodes for a season have been received
   */
  isSeasonComplete(tvdbId: string, seasonNumber: number): boolean {
    return isSeasonComplete(tvdbId, seasonNumber, this.seasonCompletionDeps)
  }

  /**
   * Initialize the retry processing scheduled jobs
   */
  async initialize(): Promise<void> {
    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-processor',
      async () => {
        const deleted = await this.processRetryWebhooks()
        if (deleted > 0) {
          this.log.debug(`Deleted ${deleted} pending webhooks`)
        }
      },
    )

    await this.fastify.db.updateSchedule('pending-webhooks-processor', {
      type: 'interval',
      config: { seconds: this._config.retryInterval },
      enabled: true,
    })

    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-cleanup',
      async () => {
        const cleaned = await this.cleanupExpiredWebhooks()
        if (cleaned > 0) {
          this.log.info(`Cleaned up ${cleaned} expired webhooks`)
        }
      },
    )

    await this.fastify.db.updateSchedule('pending-webhooks-cleanup', {
      type: 'interval',
      config: { seconds: this._config.cleanupInterval },
      enabled: true,
    })

    this._isRunning = true

    await this.processRetryWebhooks()
  }

  /**
   * Process pending webhooks that need retry
   */
  private async processRetryWebhooks(): Promise<number> {
    if (!this._isRunning) {
      return 0
    }
    return processPendingWebhooks(
      this._processingState,
      this.retryProcessorDeps,
    )
  }

  /**
   * Clean up expired pending webhooks
   */
  private async cleanupExpiredWebhooks(): Promise<number> {
    if (!this._isRunning) {
      return 0
    }
    return cleanupExpiredWebhooks(
      this._processingState,
      this.retryProcessorDeps,
    )
  }

  /**
   * Clear all pending timeouts on shutdown
   */
  shutdown(): void {
    this._isRunning = false
    clearAllTimeouts(this._queue, this.queueManagerDeps)
    for (const key of Object.keys(this._queue)) {
      delete this._queue[key]
    }
    this.log.debug('Webhook queue shutdown complete')
  }
}
