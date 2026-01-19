/**
 * Workflow Starter Module
 *
 * Handles workflow initialization including Plex connectivity verification,
 * RSS feed setup, and component initialization.
 */

import type { EtagPollResult, Item } from '@root/types/plex.types.js'
import { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import type { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for workflow initialization
 */
export interface WorkflowStartDeps {
  logger: FastifyBaseLogger
  plexService: PlexWatchlistService
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  /** Callback to cleanup existing manual sync jobs */
  cleanupExistingManualSync: () => Promise<void>
  /** Callback to setup periodic reconciliation */
  setupPeriodicReconciliation: () => Promise<void>
  /** Callback for routing ETag changes (bound from service) */
  routeEtagChange: (change: EtagPollResult) => Promise<void>
  /** Callback for routing items for user (bound from service) */
  routeItemsForUser: (userId: number, items: Item[]) => Promise<void>
  /** Callback for post-queue-drain tasks (bound from service) */
  onQueueDrained: () => void
}

/**
 * Result of workflow initialization
 */
export interface WorkflowInitResult {
  /** Whether RSS mode is enabled */
  rssMode: boolean
  /** Whether using RSS fallback (manual sync mode) */
  isEtagFallbackActive: boolean
  /** RSS feed cache manager instance (null if RSS mode disabled) */
  rssFeedCache: RssFeedCacheManager | null
  /** Deferred routing queue instance */
  deferredRoutingQueue: DeferredRoutingQueue
}

/**
 * Initialize workflow components.
 *
 * This function handles:
 * 1. Cleaning up existing manual sync jobs
 * 2. Verifying Plex connectivity
 * 3. Generating RSS feeds (or falling back to manual sync)
 * 4. Setting up periodic reconciliation
 * 5. Creating the deferred routing queue
 *
 * Timer management (RSS check interval, ETag check interval) and
 * reconciliation execution remain in the service since they manage
 * service-level state.
 *
 * @param deps - Initialization dependencies
 * @returns Initialized components and mode flags
 */
export async function initializeWorkflow(
  deps: WorkflowStartDeps,
): Promise<WorkflowInitResult> {
  let rssMode = false
  let isEtagFallbackActive = false
  let rssFeedCache: RssFeedCacheManager | null = null

  // Clean up any existing manual sync jobs from previous runs
  try {
    deps.logger.debug('Cleaning up existing manual sync jobs')
    await deps.cleanupExistingManualSync()
  } catch (cleanupError) {
    deps.logger.warn(
      { error: cleanupError },
      'Error during cleanup of existing manual sync jobs (non-fatal)',
    )
    // Continue despite this error
  }

  // Verify Plex connectivity
  try {
    deps.logger.debug('Verifying Plex connectivity')
    await deps.plexService.pingPlex()
    deps.logger.info('Plex connection verified')
  } catch (plexError) {
    deps.logger.error(
      { error: plexError },
      'Failed to verify Plex connectivity',
    )
    throw new Error('Failed to verify Plex connectivity', { cause: plexError })
  }

  // Try to generate RSS feeds
  try {
    deps.logger.debug('Generating RSS feeds')
    await deps.plexService.generateAndSaveRssFeeds()

    // Initialize RSS monitoring if feeds were generated successfully
    deps.logger.debug(
      'RSS feeds generated successfully, initializing monitoring',
    )
    // Initialize RSS feed cache for item diffing (stable key comparison)
    // Note: HTTP ETag optimization removed due to Plex S3 migration
    rssFeedCache = new RssFeedCacheManager(deps.logger)
    isEtagFallbackActive = false
    rssMode = true
  } catch (rssError) {
    deps.logger.warn(
      { error: rssError },
      'Failed to generate RSS feeds, falling back to manual sync',
    )
    isEtagFallbackActive = true
    rssMode = false
  }

  // Set up periodic reconciliation job regardless of RSS mode
  try {
    deps.logger.debug('Setting up periodic reconciliation job')
    await deps.setupPeriodicReconciliation()
  } catch (reconciliationError) {
    deps.logger.warn(
      { error: reconciliationError },
      'Failed to setup periodic reconciliation',
    )
    // Continue despite this error
  }

  // Initialize deferred routing queue for instance unavailability recovery
  const deferredRoutingQueue = new DeferredRoutingQueue({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    callbacks: {
      routeEtagChange: deps.routeEtagChange,
      routeItemsForUser: deps.routeItemsForUser,
      onDrained: deps.onQueueDrained,
    },
    log: deps.logger,
  })
  deferredRoutingQueue.start()

  return {
    rssMode,
    isEtagFallbackActive,
    rssFeedCache,
    deferredRoutingQueue,
  }
}
