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
  isRecentEpisode,
  type UpgradeTrackerDeps,
} from './detection/index.js'
import {
  type PendingStoreDeps,
  type PendingWebhookParams,
  queuePendingWebhook,
} from './persistence/index.js'
import {
  processQueuedWebhooks,
  type QueueProcessorDeps,
} from './processing/index.js'

export class WebhookQueueService {
  private readonly log: FastifyBaseLogger
  private readonly _queue: WebhookQueue = {}

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'WEBHOOK_QUEUE')
  }

  /**
   * Get the webhook queue
   */
  get queue(): WebhookQueue {
    return this._queue
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
   * Build deps for pending store operations
   */
  private get pendingStoreDeps(): PendingStoreDeps {
    return {
      db: this.fastify.db,
      logger: this.log,
      maxAgeMinutes: this.fastify.config.pendingWebhookMaxAge ?? 10,
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
   * Clear all pending timeouts on shutdown
   */
  shutdown(): void {
    clearAllTimeouts(this._queue, this.queueManagerDeps)
    for (const key of Object.keys(this._queue)) {
      delete this._queue[key]
    }
    this.log.debug('Webhook queue shutdown complete')
  }
}
