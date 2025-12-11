/**
 * Plex Label Sync Service
 *
 * Handles synchronization of Plex labels based on user watchlists and content requests.
 * Supports both webhook-triggered real-time syncing and scheduled batch processing.
 *
 * Key Features:
 * - Webhook-triggered label updates (real-time)
 * - Batch synchronization of all content
 * - Retry logic with exponential backoff
 * - Pending sync queue for items not yet available in Plex
 * - User label management with configurable format
 * - Content GUID matching and resolution
 * - Configurable concurrency control for optimal performance
 */

import type {
  RadarrMovieWithTags,
  SonarrSeriesWithTags,
  SyncResult,
} from '@root/types/plex-label-sync.types.js'
import type { WebhookPayload } from '@schemas/notifications/webhook.schema.js'
import type { PlexLabelSyncConfig } from '@schemas/plex/label-sync-config.schema.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

import {
  cleanupLabelsForWatchlistItems,
  cleanupOrphanedPlexLabels,
  removeAllLabels,
  resetLabels,
} from './plex-label-sync/cleanup/index.js'
import {
  fetchTagsForWatchlistItem,
  syncAllLabels,
} from './plex-label-sync/orchestration/batch-sync.js'
import { processPendingLabelSyncs } from './plex-label-sync/orchestration/pending-sync.js'
import {
  syncLabelForNewWatchlistItem,
  syncLabelsOnWebhook,
} from './plex-label-sync/orchestration/webhook-sync.js'

/**
 * Service to manage label synchronization between Pulsarr and Plex
 */
export class PlexLabelSyncService {
  private readonly log: FastifyBaseLogger

  /**
   * Creates a new PlexLabelSyncService instance
   *
   * @param baseLog - Fastify logger instance
   * @param fastify - Fastify instance for accessing services and config
   */
  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_LABEL_SYNC')
    this.log.info('Initializing PlexLabelSyncService')
  }

  /**
   * Access to Plex label sync configuration
   */
  private get config(): PlexLabelSyncConfig {
    return (
      this.fastify.config.plexLabelSync || {
        enabled: false,
        labelPrefix: 'pulsarr',
        concurrencyLimit: 5,
        cleanupOrphanedLabels: false,
        removedLabelMode: 'remove' as const,
        removedLabelPrefix: 'pulsarr:removed',
        autoResetOnScheduledSync: false,
        scheduleTime: undefined,
        dayOfWeek: '*',
        tagSync: {
          enabled: false,
          syncRadarrTags: true,
          syncSonarrTags: true,
        },
      }
    )
  }

  /**
   * Gets the configured label cleanup mode
   */
  private get removedLabelMode(): 'remove' | 'keep' | 'special-label' {
    return this.config.removedLabelMode || 'remove'
  }

  /**
   * Access to Plex server service
   */
  private get plexServer() {
    return this.fastify.plexServerService
  }

  /**
   * Access to database service
   */
  private get db() {
    return this.fastify.db
  }

  /**
   * Gets the prefix for special "removed" labels
   */
  private get removedLabelPrefix(): string {
    return this.config.removedLabelPrefix || 'pulsarr:removed'
  }

  /**
   * Synchronizes labels for content when a webhook is received
   * This is the main entry point for real-time label updates
   *
   * @param webhook - The webhook payload from Sonarr/Radarr
   * @returns Promise resolving to true if sync was successful, false otherwise
   */
  async syncLabelsOnWebhook(webhook: WebhookPayload): Promise<boolean> {
    return syncLabelsOnWebhook(webhook, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      queuePendingLabelSyncByWatchlistId:
        this.queuePendingLabelSyncByWatchlistId.bind(this),
      extractContentGuidFromWebhook:
        this.extractContentGuidFromWebhook.bind(this),
      extractTagsFromWebhook: this.extractTagsFromWebhook.bind(this),
      fetchTagsForWatchlistItem: this.fetchTagsForWatchlistItem.bind(this),
    })
  }

  /**
   * Synchronizes all labels for all content in batch mode using content-centric approach.
   * Each unique content item is processed exactly once with complete user set visibility.
   * Automatically resets dangling labels at the start based on current removal mode.
   *
   * @returns Promise resolving to sync results
   */
  async syncAllLabels(): Promise<SyncResult> {
    return syncAllLabels({
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      removedLabelMode: this.removedLabelMode,
      removedLabelPrefix: this.removedLabelPrefix,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      resetLabels: this.resetLabels.bind(this),
      cleanupOrphanedPlexLabels: this.cleanupOrphanedPlexLabels.bind(this),
    })
  }

  /**
   * Applies both user and webhook tag labels to a single Plex item in one API call
   *
   * @param ratingKey - The Plex rating key of the item
   * @param users - Array of users who have this content with watchlist IDs
   * @param webhookTags - Optional array of tags from webhook payload
   * @param contentType - The content type (movie/show) for proper instance checking
   * @returns Promise resolving to true if successful, false otherwise
   */

  /**
   * Adds watchlist item to the pending sync queue for later processing
   *
   * @param watchlistItemId - The watchlist item ID
   * @param title - The content title for human readability
   * @param webhookTags - Optional webhook tags to store for later application
   */
  async queuePendingLabelSyncByWatchlistId(
    watchlistItemId: number,
    title: string,
    webhookTags: string[] = [],
  ): Promise<void> {
    try {
      await this.db.createPendingLabelSync(
        watchlistItemId,
        title,
        10, // 10 minute default expiration
        webhookTags,
      )
    } catch (error) {
      this.log.error({ error }, 'Error queuing pending label sync:')
    }
  }

  /**
   * Fetches tags for a specific watchlist item from the appropriate *arr instances
   * using targeted API calls instead of fetching all content from all instances
   *
   * @param watchlistItem - The watchlist item with GUID and content info
   * @returns Array of tags found for this content, or empty array if no match
   */
  async fetchTagsForWatchlistItem(watchlistItem: {
    id: string | number
    title: string
    key: string | null
    type?: string
    guids?: string[]
    tmdbId?: number
    tvdbId?: number
  }): Promise<string[]> {
    return fetchTagsForWatchlistItem(watchlistItem, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      removedLabelMode: this.removedLabelMode,
      removedLabelPrefix: this.removedLabelPrefix,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      resetLabels: this.resetLabels.bind(this),
      cleanupOrphanedPlexLabels: this.cleanupOrphanedPlexLabels.bind(this),
    })
  }

  /**
   * Immediately syncs labels for a newly added watchlist item with tag fetching
   * This method attempts to fetch tags from *arr instances and apply them immediately
   *
   * @param watchlistItemId - The watchlist item ID
   * @param title - The content title
   * @param fetchTags - Whether to fetch tags from *arr instances
   * @returns Promise resolving to true if successful, false otherwise (queues for later if not found)
   */
  async syncLabelForNewWatchlistItem(
    watchlistItemId: number,
    title: string,
    fetchTags = true,
  ): Promise<boolean> {
    return syncLabelForNewWatchlistItem(watchlistItemId, title, fetchTags, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      queuePendingLabelSyncByWatchlistId:
        this.queuePendingLabelSyncByWatchlistId.bind(this),
      extractContentGuidFromWebhook:
        this.extractContentGuidFromWebhook.bind(this),
      extractTagsFromWebhook: this.extractTagsFromWebhook.bind(this),
      fetchTagsForWatchlistItem: this.fetchTagsForWatchlistItem.bind(this),
    })
  }

  /**
   * Extracts tags from webhook payload
   *
   * @param webhook - The webhook payload
   * @returns Array of tags from the webhook, or empty array if none available
   */
  private extractTagsFromWebhook(webhook: WebhookPayload): string[] {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return []
      }

      if ('movie' in webhook && webhook.movie.tags) {
        // Radarr webhook
        return webhook.movie.tags.map(String)
      }

      if ('series' in webhook && webhook.series.tags) {
        // Sonarr webhook
        return webhook.series.tags.map(String)
      }

      return []
    } catch (error) {
      this.log.error({ error }, 'Error extracting tags from webhook:')
      return []
    }
  }

  /**
   * Extracts content GUID array and type from webhook payload
   *
   * @param webhook - The webhook payload
   * @returns Object containing GUID array and content type, or null if not extractable
   */
  private extractContentGuidFromWebhook(
    webhook: WebhookPayload,
  ): { guids: string[]; contentType: 'movie' | 'show' } | null {
    try {
      if ('eventType' in webhook && webhook.eventType === 'Test') {
        return null
      }

      if ('movie' in webhook) {
        // Radarr webhook
        return {
          guids: [`tmdb:${webhook.movie.tmdbId}`],
          contentType: 'movie',
        }
      }

      if ('series' in webhook) {
        // Sonarr webhook
        return {
          guids: [`tvdb:${webhook.series.tvdbId}`],
          contentType: 'show',
        }
      }

      return null
    } catch (error) {
      this.log.error({ error }, 'Error extracting content GUID from webhook:')
      return null
    }
  }

  /**
   * Processes pending label syncs and retries failed items
   * This should be called periodically by a scheduler
   *
   * @returns Promise resolving to processing results
   */
  async processPendingLabelSyncs(): Promise<SyncResult> {
    return processPendingLabelSyncs({
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      removedLabelMode: this.removedLabelMode,
      removedLabelPrefix: this.removedLabelPrefix,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
    })
  }

  /**
   * Removes labels associated with watchlist items that are being deleted
   *
   * This method handles cleanup of Plex labels when watchlist items are removed.
   * It uses the provided watchlist item data to clean up tracking records and
   * remove corresponding labels from Plex content.
   *
   * @param watchlistItems - Array of watchlist items that are being deleted with full data
   */
  async cleanupLabelsForWatchlistItems(
    watchlistItems: Array<{
      id: number
      title?: string
      key: string
      user_id: number
      guids: string[]
      contentType: 'movie' | 'show'
    }>,
  ): Promise<void> {
    return cleanupLabelsForWatchlistItems(watchlistItems, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      radarrManager: this.fastify.radarrManager,
      sonarrManager: this.fastify.sonarrManager,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
      tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
      removedTagPrefix:
        this.fastify.config.removedTagPrefix || 'pulsarr-removed',
    })
  }

  /**
   * Removes all Pulsarr-created labels from Plex content items that are tracked in the database.
   * This preserves any other labels that were not created by Pulsarr.
   *
   * @returns Promise resolving to removal results
   */
  async removeAllLabels(): Promise<{
    processed: number
    removed: number
    failed: number
  }> {
    return removeAllLabels({
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
    })
  }

  /**
   * Cleanup orphaned Plex labels - removes only truly orphaned labels based on current state
   *
   * Proper orphaned cleanup that:
   * 1. Gets all sync-enabled users who should have labels
   * 2. Builds the set of valid labels that should exist
   * 3. Uses tracking table to find labels that exist but are no longer valid
   * 4. Removes only the orphaned labels, preserving legitimate labels
   *
   * @returns Promise resolving to cleanup results
   */
  async cleanupOrphanedPlexLabels(
    radarrMoviesWithTags?: RadarrMovieWithTags[],
    sonarrSeriesWithTags?: SonarrSeriesWithTags[],
  ): Promise<{
    removed: number
    failed: number
  }> {
    return cleanupOrphanedPlexLabels(
      radarrMoviesWithTags,
      sonarrSeriesWithTags,
      {
        plexServer: this.plexServer,
        db: this.db,
        logger: this.log,
        config: this.config,
        radarrManager: this.fastify.radarrManager,
        sonarrManager: this.fastify.sonarrManager,
        fastify: this.fastify,
        labelPrefix: this.config.labelPrefix,
        removedLabelPrefix: this.removedLabelPrefix,
        removedLabelMode: this.removedLabelMode,
        tagPrefix: this.fastify.config.tagPrefix || 'pulsarr-user',
        removedTagPrefix:
          this.fastify.config.removedTagPrefix || 'pulsarr-removed',
      },
    )
  }

  /**
   * Reset Plex labels and tracking table based on current removal mode settings.
   * Accepts watchlist items as parameter OR compiles existing watchlist if called standalone.
   * Reuses existing cleanup logic to handle all removal modes (remove/keep/special-label).
   *
   * @param watchlistItems - Optional array of watchlist items to process. If not provided, all watchlist items are fetched.
   * @returns Promise resolving to processing results
   */
  async resetLabels(
    watchlistItems?: Array<{
      id: string | number
      user_id: number
      guids?: string[] | string
      title: string
      type?: string
      key: string | null
    }>,
  ): Promise<{ processed: number; updated: number; failed: number }> {
    return resetLabels(watchlistItems, {
      plexServer: this.plexServer,
      db: this.db,
      logger: this.log,
      config: this.config,
      fastify: this.fastify,
      labelPrefix: this.config.labelPrefix,
      removedLabelPrefix: this.removedLabelPrefix,
      removedLabelMode: this.removedLabelMode,
    })
  }
}
