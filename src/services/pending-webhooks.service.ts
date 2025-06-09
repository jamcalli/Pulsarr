import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PendingWebhooksConfig } from '@root/types/pending-webhooks.types.js'
import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type {
  MediaNotification,
  NotificationResult,
} from '@root/types/sonarr.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import { processContentNotifications } from '@root/utils/notification-processor.js'

/**
 * Service to handle webhooks that arrive before RSS feed matching is complete.
 * This solves the race condition where content is grabbed quickly and the webhook
 * arrives while the RSS item is still being processed.
 */
export class PendingWebhooksService {
  /**
   * Send Tautulli notification for a user
   */
  private async sendTautulliNotification(
    result: NotificationResult,
    matchingItems: TokenWatchlistItem[],
    webhook: { guid: string },
  ): Promise<void> {
    if (!result.user.notify_tautulli || !this.fastify.tautulli?.isEnabled()) {
      return
    }

    const userItem = matchingItems.find(
      (item) => item.user_id === result.user.id,
    )

    if (userItem) {
      const itemId =
        typeof userItem.id === 'string'
          ? Number.parseInt(userItem.id, 10)
          : userItem.id

      try {
        await this.fastify.tautulli.sendMediaNotification(
          result.user,
          result.notification,
          itemId,
          webhook.guid,
          userItem.key,
        )
      } catch (error) {
        this.log.error(
          { error, userId: result.user.id, guid: webhook.guid },
          'Failed to send Tautulli notification',
        )
      }
    }
  }
  private readonly _config: PendingWebhooksConfig
  private isRunning = false
  private _processingWebhooks = false
  private _cleaningUp = false

  constructor(
    private readonly log: FastifyBaseLogger,
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
   * Initialize the pending webhooks service
   */
  async initialize(): Promise<void> {
    // Schedule the processing job with a wrapper that suppresses logs when no work is done
    await this.fastify.scheduler.scheduleJob(
      'pending-webhooks-processor',
      async (jobName: string) => {
        const processed = await this.processWebhooks()
        // Only log completion if we actually processed something
        if (processed > 0) {
          this.log.info(`Processed ${processed} pending webhooks`)
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
      async (jobName: string) => {
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

      let processedCount = 0

      for (const webhook of webhooks) {
        try {
          // Check if RSS items exist for this GUID
          const matchingItems = await this.fastify.db.getWatchlistItemsByGuid(
            webhook.guid,
          )

          if (matchingItems.length > 0) {
            this.log.info(
              `Found ${matchingItems.length} items for ${webhook.guid}, processing webhook`,
            )

            // Process based on instance type
            if (webhook.media_type === 'movie') {
              // For movies, we don't need to parse the payload
              const mediaInfo = {
                type: 'movie' as const,
                guid: webhook.guid,
                title: webhook.title,
              }

              await processContentNotifications(
                this.fastify,
                mediaInfo,
                false,
                {
                  logger: this.log,
                  onUserNotification: async (result) => {
                    // Send Tautulli notifications for regular users
                    await this.sendTautulliNotification(
                      result,
                      matchingItems,
                      webhook,
                    )
                  },
                },
              )
            } else if (webhook.media_type === 'show') {
              // For shows, we need to parse the payload to get episode information
              let body: WebhookPayload
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
                throw parseError
              }

              // Handle episode notifications
              // Note: instanceName comparison is case-sensitive to match the webhook schema
              if (
                'instanceName' in body &&
                body.instanceName === 'Sonarr' &&
                'episodes' in body &&
                body.episodes.length > 0
              ) {
                const mediaInfo = {
                  type: 'show' as const,
                  guid: webhook.guid,
                  title: webhook.title,
                  episodes: body.episodes,
                }

                await processContentNotifications(
                  this.fastify,
                  mediaInfo,
                  body.episodes.length > 1,
                  {
                    logger: this.log,
                    onUserNotification: async (result) => {
                      // Send Tautulli notifications for regular users
                      await this.sendTautulliNotification(
                        result,
                        matchingItems,
                        webhook,
                      )
                    },
                  },
                )
              }
            }

            // Delete the processed webhook
            if (webhook.id) {
              const deleted = await this.fastify.db.deletePendingWebhook(
                webhook.id,
              )
              if (deleted) {
                processedCount++
              } else {
                this.log.warn(
                  `Failed to delete processed webhook ${webhook.id}`,
                )
              }
            }
          } else {
            this.log.debug(
              `No items found for ${webhook.guid}, webhook remains pending`,
            )
          }
        } catch (webhookError) {
          this.log.error(
            `Error processing pending webhook ${webhook.id}:`,
            webhookError,
          )
        }
      }

      return processedCount
    } catch (error) {
      this.log.error('Error processing pending webhooks:', error)
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
      this.log.error('Error cleaning up expired webhooks:', error)
      return 0
    } finally {
      this._cleaningUp = false
    }
  }
}
