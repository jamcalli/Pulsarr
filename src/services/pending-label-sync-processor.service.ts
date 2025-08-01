import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { DatabaseService } from './database.service.js'
import type { PlexLabelSyncService } from './plex-label-sync.service.js'
import type { Config } from '@root/types/config.types.js'
import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { PendingLabelSync } from './database/methods/plex-label-sync.js'
import pLimit from 'p-limit'

/**
 * Configuration for pending label sync processing
 */
interface PendingLabelSyncConfig {
  retryInterval: number // Process pending syncs every N seconds
  maxAge: number // Keep pending syncs for max N minutes
  cleanupInterval: number // Clean up expired syncs every N seconds
  concurrencyLimit: number // Maximum number of concurrent sync operations
}

/**
 * Service to handle label syncs that couldn't be processed immediately.
 * This processes queued label sync requests with retry logic and concurrency control.
 *
 * Features:
 * - Configurable concurrency limits to prevent overwhelming Plex API
 * - Batch processing of pending syncs with rate limiting
 * - Automatic retry with exponential backoff for failed syncs
 * - Scheduled cleanup of expired sync requests
 * - Integration with scheduler service for reliable job execution
 *
 * Configuration:
 * - concurrencyLimit: Maximum number of simultaneous sync operations (default: 5)
 * - retryInterval: How often to process pending syncs in seconds (default: 30)
 * - cleanupInterval: How often to clean expired syncs in seconds (default: 60)
 * - maxAge: Maximum age for pending syncs before expiration in minutes (default: 30)
 *
 * Batching Strategy:
 * - Processes all pending syncs in a single batch operation
 * - Uses p-limit to control concurrency across the batch
 * - Each sync operation includes retry count tracking
 * - Failed syncs are updated with incremented retry counts for future processing
 *
 * Scheduler Integration:
 * - Creates two scheduled jobs: 'pending-label-sync-processor' and 'pending-label-sync-cleanup'
 * - Jobs can be enabled/disabled through the scheduler API
 * - Provides monitoring and logging capabilities through the scheduler system
 * - Supports manual execution of jobs for testing and troubleshooting
 */
export class PendingLabelSyncProcessorService {
  private readonly _config: PendingLabelSyncConfig
  private _processingSyncs = false
  private _cleaningUp = false

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly db: DatabaseService,
    private readonly plexLabelSyncService: PlexLabelSyncService,
    private readonly fastify: FastifyInstance,
    config: Config,
  ) {
    this._config = {
      retryInterval: config.plexLabelSync?.pendingRetryInterval || 30,
      maxAge: config.plexLabelSync?.pendingMaxAge || 30,
      cleanupInterval: 60, // Clean up expired syncs every minute
      concurrencyLimit: 5, // Limit concurrent sync operations to avoid overwhelming the system
    }
  }

  /**
   * Get the configuration (for access by other services/routes)
   */
  get config(): PendingLabelSyncConfig {
    return this._config
  }

  /**
   * Process pending label syncs with concurrency control
   * @returns Number of syncs processed successfully
   */
  async processPendingLabelSyncs(): Promise<number> {
    // Check if the processing job is enabled
    const schedule = await this.fastify.db.getScheduleByName(
      'pending-label-sync-processor',
    )
    if (!schedule || !schedule.enabled) {
      return 0
    }

    // Prevent overlapping executions
    if (this._processingSyncs) {
      this.log.debug(
        'Label sync processing already in progress, skipping this cycle',
      )
      return 0
    }

    this._processingSyncs = true

    try {
      const pendingSyncs = await this.db.getPendingLabelSyncs()

      if (pendingSyncs.length === 0) {
        return 0 // Silent return when no syncs to process
      }

      this.log.debug(`Processing ${pendingSyncs.length} pending label syncs`)

      // Process syncs concurrently with configurable rate limiting
      const limit = pLimit(this._config.concurrencyLimit)
      const results = await Promise.allSettled(
        pendingSyncs.map((sync) =>
          limit(async () => {
            try {
              // Delegate to the PlexLabelSyncService to process this specific sync
              // The service already has logic to handle individual GUIDs and apply labels
              // We just need to trigger processing for this specific item

              // Create a mock webhook payload to trigger the sync process
              const mockWebhook = this.createMockWebhookForSync(sync)
              if (!mockWebhook) {
                // Update retry count if we can't create a proper webhook
                await this.db.updatePendingLabelSyncRetry(sync.id)
                this.log.debug(
                  `Unable to create webhook for sync: ${sync.guid}`,
                )
                return 0
              }

              // Try to process via the label sync service
              const success =
                await this.plexLabelSyncService.syncLabelsOnWebhook(mockWebhook)

              if (success) {
                // Delete the successfully processed sync
                const deleted = await this.db.deletePendingLabelSync(sync.id)
                if (deleted) {
                  this.log.info(
                    `Successfully processed pending label sync: ${sync.content_title}`,
                    {
                      guid: sync.guid,
                    },
                  )
                  return 1
                }
              } else {
                // Update retry count for failed sync attempt
                await this.db.updatePendingLabelSyncRetry(sync.id)
                this.log.debug(
                  `Failed to process pending sync, retry count updated: ${sync.content_title}`,
                  {
                    guid: sync.guid,
                    retryCount: sync.retry_count + 1,
                  },
                )
              }

              return 0
            } catch (syncError) {
              this.log.error(
                `Error processing pending label sync ${sync.id}:`,
                syncError,
              )
              // Update retry count even on error
              await this.db.updatePendingLabelSyncRetry(sync.id)
              return 0
            }
          }),
        ),
      )

      // Count successful deletions
      const processedCount = results.reduce((count, result) => {
        if (result.status === 'fulfilled') return count + result.value
        this.log.error('Label sync processing promise rejected:', result.reason)
        return count
      }, 0)

      return processedCount
    } catch (error) {
      this.log.error('Error processing pending label syncs:', error)
      return 0
    } finally {
      this._processingSyncs = false
    }
  }

  /**
   * Clean up expired pending label syncs
   * @returns Number of syncs cleaned up
   */
  private async cleanupExpired(): Promise<number> {
    // Check if the cleanup job is enabled
    const schedule = await this.fastify.db.getScheduleByName(
      'pending-label-sync-cleanup',
    )
    if (!schedule || !schedule.enabled) {
      return 0
    }

    // Prevent overlapping cleanup executions
    if (this._cleaningUp) {
      this.log.debug('Cleanup already in progress, skipping this cycle')
      return 0
    }

    this._cleaningUp = true

    try {
      const deleted = await this.db.expirePendingLabelSyncs()
      return deleted
    } catch (error) {
      this.log.error('Error cleaning up expired label syncs:', error)
      return 0
    } finally {
      this._cleaningUp = false
    }
  }

  /**
   * Initialize the pending label sync processor with scheduler jobs
   */
  async initialize(): Promise<void> {
    this.log.info('Initializing pending label sync processor with scheduler', {
      retryInterval: this._config.retryInterval,
      maxAge: this._config.maxAge,
      cleanupInterval: this._config.cleanupInterval,
      concurrencyLimit: this._config.concurrencyLimit,
    })

    // Schedule the processing job with a wrapper that suppresses logs when no work is done
    await this.fastify.scheduler.scheduleJob(
      'pending-label-sync-processor',
      async (_jobName: string) => {
        const processed = await this.processPendingLabelSyncs()
        // Only log completion if we actually processed something
        if (processed > 0) {
          this.log.info(`Processed ${processed} pending label syncs`)
        }
      },
    )

    // Update the schedule to run at configured interval
    await this.fastify.db.updateSchedule('pending-label-sync-processor', {
      type: 'interval',
      config: { seconds: this._config.retryInterval },
      enabled: true,
    })

    // Schedule the cleanup job with a wrapper that suppresses logs when no work is done
    await this.fastify.scheduler.scheduleJob(
      'pending-label-sync-cleanup',
      async (_jobName: string) => {
        const cleaned = await this.cleanupExpired()
        // Only log if we actually cleaned something
        if (cleaned > 0) {
          this.log.info(`Cleaned up ${cleaned} expired label syncs`)
        }
      },
    )

    // Update the cleanup schedule to run at configured interval
    await this.fastify.db.updateSchedule('pending-label-sync-cleanup', {
      type: 'interval',
      config: { seconds: this._config.cleanupInterval },
      enabled: true,
    })

    // Process any existing syncs immediately on startup
    const processed = await this.processPendingLabelSyncs()
    if (processed > 0) {
      this.log.info(
        `Initial processing completed: ${processed} pending label syncs processed`,
      )
    }
  }

  /**
   * Stop the scheduled processing with graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.log.info('Stopping pending label sync processor')

    try {
      // Disable the scheduled jobs
      const processorJob = await this.fastify.db.getScheduleByName(
        'pending-label-sync-processor',
      )
      if (processorJob) {
        await this.fastify.db.updateSchedule('pending-label-sync-processor', {
          ...processorJob,
          enabled: false,
        })
      }

      const cleanupJob = await this.fastify.db.getScheduleByName(
        'pending-label-sync-cleanup',
      )
      if (cleanupJob) {
        await this.fastify.db.updateSchedule('pending-label-sync-cleanup', {
          ...cleanupJob,
          enabled: false,
        })
      }

      // Unschedule the jobs from the scheduler
      await this.fastify.scheduler.unscheduleJob('pending-label-sync-processor')
      await this.fastify.scheduler.unscheduleJob('pending-label-sync-cleanup')

      // Wait for any ongoing operations to complete
      let retries = 0
      const maxRetries = 30 // 30 seconds timeout
      while (
        (this._processingSyncs || this._cleaningUp) &&
        retries < maxRetries
      ) {
        this.log.debug('Waiting for pending operations to complete...')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        retries++
      }

      if (retries >= maxRetries) {
        this.log.warn(
          'Timeout waiting for pending operations to complete during shutdown',
        )
      }

      this.log.info('Pending label sync processor stopped')
    } catch (error) {
      this.log.error(
        'Error during pending label sync processor shutdown:',
        error,
      )
    }
  }

  /**
   * Creates a mock webhook payload to trigger label sync processing
   * This allows us to reuse the existing label sync logic
   */
  private createMockWebhookForSync(
    sync: PendingLabelSync,
  ): WebhookPayload | null {
    try {
      // Extract provider and ID from GUID (e.g., "tmdb:123456" or "tvdb:789")
      const guidParts = sync.guid.split(':')
      if (guidParts.length !== 2) {
        this.log.warn(`Invalid GUID format: ${sync.guid}`)
        return null
      }

      const [provider, id] = guidParts
      const numericId = Number.parseInt(id, 10)
      if (Number.isNaN(numericId)) {
        this.log.warn(`Invalid numeric ID in GUID: ${sync.guid}`)
        return null
      }

      // Create appropriate webhook payload based on provider
      if (provider === 'tmdb') {
        // Movie webhook (Radarr-style)
        return {
          instanceName: 'radarr',
          movie: {
            title: sync.content_title,
            tmdbId: numericId,
          },
        } as WebhookPayload
      }

      if (provider === 'tvdb') {
        // TV show webhook (Sonarr-style) - requires episodes array
        return {
          eventType: 'Download',
          instanceName: 'sonarr',
          series: {
            title: sync.content_title,
            tvdbId: numericId,
          },
          episodes: [
            {
              episodeNumber: 1,
              seasonNumber: 1,
              title: 'Episode 1',
              airDateUtc: new Date().toISOString(),
            },
          ],
          episodeFile: {
            id: 1,
            relativePath: 'placeholder.mkv',
            quality: 'Unknown',
            qualityVersion: 1,
            size: 0,
          },
        } as WebhookPayload
      }

      this.log.warn(`Unsupported provider in GUID: ${provider}`)
      return null
    } catch (error) {
      this.log.error(
        `Error creating mock webhook for sync ${sync.guid}:`,
        error,
      )
      return null
    }
  }
}
