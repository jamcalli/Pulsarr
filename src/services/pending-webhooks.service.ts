import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { PendingWebhooksConfig } from '@root/types/pending-webhooks.types.js'
import { processContentNotifications } from '@root/utils/notification-processor.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

/**
 * Service to handle webhooks that arrive before RSS feed matching is complete.
 * This solves the race condition where content is grabbed quickly and the webhook
 * arrives while the RSS item is still being processed.
 */
export class PendingWebhooksService {
  private readonly _config: PendingWebhooksConfig
  private isRunning = false
  private _processingWebhooks = false
  private _cleaningUp = false
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'PENDING_WEBHOOKS')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    config?: Partial<PendingWebhooksConfig>,
  ) {
    this._config = {
      retryInterval: 20, // Process every 20 seconds
      maxAge: 10, // Keep webhooks for max 10 minutes
      cleanupInterval: 60, // Clean up expired webhooks every minute
      ...config,
    }
  }

  /**
   * Get the configuration (for access by other services/routes)
   */
  get config(): PendingWebhooksConfig {
    return this._config
  }

  /**
   * Helper method to delete a webhook and return count
   */
  private async deleteWebhookAndCount(
    webhookId: number | undefined,
  ): Promise<number> {
    if (!webhookId) return 0
    const deleted = await this.fastify.db.deletePendingWebhook(webhookId)
    return deleted ? 1 : 0
  }

  /**
   * Helper method to trigger label sync for content after webhooks are processed
   */
  private async triggerLabelSync(
    webhookId: number | undefined,
    payload: unknown,
    mediaType: 'movie' | 'show',
  ): Promise<void> {
    if (
      !this.fastify.config.plexLabelSync?.enabled ||
      !this.fastify.plexLabelSyncService ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return
    }

    // Validate webhook payload using schema
    try {
      const { WebhookPayloadSchema } = await import(
        '@root/schemas/notifications/webhook.schema.js'
      )
      const parsed = WebhookPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        this.log.debug(
          `Skipping invalid webhook payload for ${mediaType} webhook ${webhookId}:`,
          parsed.error.issues,
        )
        return
      }

      await this.fastify.plexLabelSyncService.syncLabelsOnWebhook(parsed.data)
    } catch (labelError) {
      this.log.error(
        `Error syncing labels for pending ${mediaType} webhook ${webhookId}:`,
        labelError,
      )
    }
  }

  /**
   * Initialize the pending webhooks service
   */
  async initialize(): Promise<void> {
    // Schedule the processing job with a wrapper that suppresses logs when no work is done
    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-processor',
      async (_jobName: string) => {
        const deleted = await this.processWebhooks()
        // Only log completion if we actually processed something
        if (deleted > 0) {
          this.log.debug(`Deleted ${deleted} pending webhooks`)
        }
      },
    )

    // Update the schedule to run every 20 seconds
    await this.fastify.db.updateSchedule('pending-webhooks-processor', {
      type: 'interval',
      config: { seconds: this._config.retryInterval },
      enabled: true,
    })

    // Schedule the cleanup job with a wrapper that suppresses logs when no work is done
    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-cleanup',
      async (_jobName: string) => {
        const cleaned = await this.cleanupExpired()
        // Only log if we actually cleaned something
        if (cleaned > 0) {
          this.log.info(`Cleaned up ${cleaned} expired webhooks`)
        }
      },
    )

    // Update the schedule to run at configured interval
    await this.fastify.db.updateSchedule('pending-webhooks-cleanup', {
      type: 'interval',
      config: { seconds: this._config.cleanupInterval },
      enabled: true,
    })

    this.isRunning = true

    // Process any existing webhooks immediately on startup
    await this.processWebhooks()
  }

  /**
   * Process pending webhooks
   * @returns Number of webhooks processed
   */
  private async processWebhooks(): Promise<number> {
    if (!this.isRunning) {
      return 0
    }

    // Prevent overlapping executions
    if (this._processingWebhooks) {
      this.log.debug(
        'Webhook processing already in progress, skipping this cycle',
      )
      return 0
    }

    this._processingWebhooks = true

    try {
      const webhooks = await this.fastify.db.getPendingWebhooks()

      if (webhooks.length === 0) {
        return 0 // Silent return when no webhooks to process
      }

      // Process webhooks concurrently with rate limiting
      const limit = pLimit(5) // Limit to 5 concurrent webhooks to avoid overwhelming the system
      const results = await Promise.allSettled(
        webhooks.map((webhook) =>
          limit(async () => {
            try {
              // Process based on instance type
              if (webhook.media_type === 'movie') {
                // Parse the payload to get the full webhook data for label sync
                let moviePayload: WebhookPayload | unknown
                try {
                  moviePayload =
                    typeof webhook.payload === 'string'
                      ? JSON.parse(webhook.payload)
                      : webhook.payload
                } catch (parseError) {
                  this.log.error(
                    `Failed to parse payload for movie webhook ${webhook.id}:`,
                    parseError,
                  )
                  return await this.deleteWebhookAndCount(webhook.id)
                }

                const mediaInfo = {
                  type: 'movie' as const,
                  guid: webhook.guid,
                  title: webhook.title,
                }

                // Check for watchlist items directly (independent of notification settings)
                const watchlistItems =
                  await this.fastify.db.getWatchlistItemsByGuid(webhook.guid)

                // Process notifications (separate from label sync)
                await processContentNotifications(
                  this.fastify,
                  mediaInfo,
                  false,
                  {
                    logger: this.log,
                  },
                )

                if (watchlistItems.length > 0) {
                  // Also trigger label sync for the content now that we found watchlist items
                  await this.triggerLabelSync(webhook.id, moviePayload, 'movie')

                  this.log.debug(
                    `Found ${watchlistItems.length} watchlist items for ${webhook.guid}, processed webhook`,
                  )
                  // Delete the processed webhook
                  return await this.deleteWebhookAndCount(webhook.id)
                }
                this.log.debug(
                  `No items found for ${webhook.guid}, webhook remains pending`,
                )
              } else if (webhook.media_type === 'show') {
                // For shows, we need to parse the payload to get episode information
                let body: WebhookPayload | unknown
                try {
                  // Safe parse payload in case it's a string (defensive programming)
                  body =
                    typeof webhook.payload === 'string'
                      ? JSON.parse(webhook.payload)
                      : webhook.payload
                } catch (parseError) {
                  this.log.error(
                    `Failed to parse payload for webhook ${webhook.id}:`,
                    parseError,
                  )
                  // Delete webhook with malformed payload to prevent infinite retries
                  const deleted = await this.deleteWebhookAndCount(webhook.id)
                  if (deleted > 0) {
                    this.log.warn(
                      `Deleted webhook ${webhook.id} due to malformed payload`,
                    )
                  }
                  return deleted
                }

                // Abort if payload is not a non-null object
                if (
                  typeof body !== 'object' ||
                  body === null ||
                  Array.isArray(body)
                ) {
                  this.log.warn(
                    `Webhook ${webhook.id} payload is not an object; discarding`,
                  )
                  return await this.deleteWebhookAndCount(webhook.id)
                }

                // Type assertion after object guard
                const payload = body as WebhookPayload

                // Handle episode notifications
                if (
                  'instanceName' in payload &&
                  payload.instanceName?.toLowerCase() === 'sonarr' &&
                  'episodes' in payload &&
                  Array.isArray(payload.episodes) &&
                  payload.episodes.length > 0
                ) {
                  const mediaInfo = {
                    type: 'show' as const,
                    guid: webhook.guid,
                    title: webhook.title,
                    episodes: payload.episodes,
                  }

                  // Check for watchlist items directly (independent of notification settings)
                  const watchlistItems =
                    await this.fastify.db.getWatchlistItemsByGuid(webhook.guid)

                  // Process notifications (separate from label sync)
                  await processContentNotifications(
                    this.fastify,
                    mediaInfo,
                    payload.episodes.length > 1,
                    {
                      logger: this.log,
                    },
                  )

                  if (watchlistItems.length > 0) {
                    // Also trigger label sync for the content now that we found watchlist items
                    await this.triggerLabelSync(webhook.id, payload, 'show')

                    this.log.debug(
                      `Found ${watchlistItems.length} watchlist items for ${webhook.guid}, processed webhook`,
                    )
                    // Delete the processed webhook
                    return await this.deleteWebhookAndCount(webhook.id)
                  }
                  this.log.debug(
                    `No items found for ${webhook.guid}, webhook remains pending`,
                  )
                }
              }
              return 0
            } catch (webhookError) {
              this.log.error(
                `Error processing pending webhook ${webhook.id}:`,
                webhookError,
              )
              return 0
            }
          }),
        ),
      )

      // Count successful deletions
      const deletedCount = results.reduce((count, result) => {
        if (result.status === 'fulfilled') return count + result.value
        this.log.error(
          { error: result.reason },
          'Webhook processing promise rejected:',
        )
        return count
      }, 0)

      return deletedCount
    } catch (error) {
      this.log.error({ error }, 'Error processing pending webhooks:')
      return 0
    } finally {
      this._processingWebhooks = false
    }
  }

  /**
   * Clean up expired webhooks
   * @returns Number of webhooks cleaned up
   */
  private async cleanupExpired(): Promise<number> {
    if (!this.isRunning) {
      return 0
    }

    // Prevent overlapping cleanup executions
    if (this._cleaningUp) {
      this.log.debug('Cleanup already in progress, skipping this cycle')
      return 0
    }

    this._cleaningUp = true

    try {
      const deleted = await this.fastify.db.cleanupExpiredWebhooks()
      return deleted
    } catch (error) {
      this.log.error({ error }, 'Error cleaning up expired webhooks:')
      return 0
    } finally {
      this._cleaningUp = false
    }
  }
}
