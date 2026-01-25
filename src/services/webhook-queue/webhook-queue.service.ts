/**
 * Webhook Queue Service
 *
 * Orchestrates webhook batching and processing for Sonarr/Radarr notifications.
 * Consolidates queue state management, episode detection, and pending webhook handling.
 */

import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { WebhookQueue } from '@root/types/webhook.types.js'
import { createServiceLogger } from '@utils/logger.js'
import {
  checkForUpgrade,
  isEpisodeAlreadyQueued,
  isRecentEpisode,
  processQueuedWebhooks,
  queuePendingWebhook,
  webhookQueue,
} from '@utils/webhook/index.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class WebhookQueueService {
  private readonly log: FastifyBaseLogger

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'WEBHOOK_QUEUE')
  }

  /**
   * Get the webhook queue (delegates to global for now)
   */
  get queue(): WebhookQueue {
    return webhookQueue
  }

  /**
   * Check if an episode is already queued
   */
  isEpisodeAlreadyQueued(
    tvdbId: string,
    seasonNumber: number,
    episodeNumber: number,
  ): boolean {
    return isEpisodeAlreadyQueued(tvdbId, seasonNumber, episodeNumber)
  }

  /**
   * Check if an episode aired recently (within configured threshold)
   */
  isRecentEpisode(airDateUtc: string): boolean {
    return isRecentEpisode(airDateUtc, this.fastify)
  }

  /**
   * Process queued webhooks for a show/season
   */
  async processQueuedWebhooks(
    tvdbId: string,
    seasonNumber: number,
  ): Promise<void> {
    return processQueuedWebhooks(tvdbId, seasonNumber, this.fastify)
  }

  /**
   * Queue a pending webhook for later processing
   */
  async queuePendingWebhook(params: {
    instanceType: 'sonarr' | 'radarr'
    instanceId: number | null
    guid: string
    title: string
    mediaType: 'movie' | 'show'
    payload: WebhookPayload
  }): Promise<void> {
    return queuePendingWebhook(this.fastify, params)
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
      this.fastify,
    )
  }

  /**
   * Clear all pending timeouts on shutdown
   */
  shutdown(): void {
    for (const [tvdbId, show] of Object.entries(webhookQueue)) {
      for (const [seasonNumber, season] of Object.entries(show.seasons)) {
        if (season.timeoutId) {
          clearTimeout(season.timeoutId)
          this.log.debug({ tvdbId, seasonNumber }, 'Cleared queue timeout')
        }
      }
    }
    // Clear the queue
    for (const key of Object.keys(webhookQueue)) {
      delete webhookQueue[key]
    }
    this.log.debug('Webhook queue shutdown complete')
  }
}
