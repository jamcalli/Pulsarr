import type { PendingLabelSyncConfig } from '@root/types/pending-label-sync-processor.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Service to handle label syncs that couldn't be processed immediately.
 * This processes queued label sync requests using direct Plex key access for optimal performance.
 *
 * Features:
 * - Direct Plex key access (no GUID searching required)
 * - Batch processing of pending syncs with rate limiting
 * - Scheduled retry for failed syncs
 * - Scheduled cleanup of expired sync requests
 * - Integration with scheduler service for reliable job execution
 *
 * Configuration:
 * - retryInterval: How often to process pending syncs in seconds (default: 30)
 * - cleanupInterval: How often to clean expired syncs in seconds (default: 60)
 * - maxAge: Maximum age for pending syncs before expiration in minutes (default: 10)
 *
 * Note: Concurrency control is handled by the PlexLabelSyncService using config.plexLabelSync.concurrencyLimit
 *
 * Performance Improvements:
 * - Uses watchlist_item_id instead of GUID for direct database access
 * - Eliminates expensive Plex GUID searching
 * - Processes items with Plex keys immediately
 * - Dramatically reduces processing time from minutes to seconds
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
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'PENDING_LABEL_SYNC')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this._config = {
      retryInterval: 30, // Default retry interval - not configurable
      maxAge: 10, // Default max age - not configurable
      cleanupInterval: 60, // Clean up expired syncs every minute - not configurable
    }
  }

  /**
   * Get the configuration (for access by other services/routes)
   */
  get config(): PendingLabelSyncConfig {
    return this._config
  }

  /**
   * Access to database service
   */
  private get db() {
    return this.fastify.db
  }

  /**
   * Access to plex label sync service
   */
  private get plexLabelSyncService() {
    return this.fastify.plexLabelSyncService
  }

  /**
   * Process pending label syncs using direct Plex key access
   * Delegates to PlexLabelSyncService's optimized processPendingLabelSyncs method
   * @returns Number of syncs processed successfully
   */
  async processPendingLabelSyncs(): Promise<number> {
    // Prevent overlapping executions
    if (this._processingSyncs) {
      this.log.debug(
        'Label sync processing already in progress, skipping this cycle',
      )
      return 0
    }

    this._processingSyncs = true

    try {
      // Delegate to the PlexLabelSyncService which now uses direct Plex key access
      // This eliminates the need for mock webhooks and GUID searching
      const result = await this.plexLabelSyncService.processPendingLabelSyncs()

      if (result.updated > 0) {
        this.log.info(
          {
            processed: result.processed,
            updated: result.updated,
            failed: result.failed,
            pending: result.pending,
          },
          `Processed ${result.updated} pending label syncs using direct Plex key access`,
        )
      }

      return result.updated
    } catch (error) {
      this.log.error({ error }, 'Error processing pending label syncs:')
      return 0
    } finally {
      this._processingSyncs = false
    }
  }

  /**
   * Clean up expired pending label syncs
   * @returns Number of syncs cleaned up
   */
  async cleanupExpired(): Promise<number> {
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
      this.log.error({ error }, 'Error cleaning up expired label syncs:')
      return 0
    } finally {
      this._cleaningUp = false
    }
  }
}
