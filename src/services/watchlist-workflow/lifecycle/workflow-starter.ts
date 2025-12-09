/**
 * Workflow Starter Module
 *
 * Handles workflow initialization including Plex connectivity verification,
 * RSS feed setup, and component initialization.
 */

import type { EtagPollResult, Item } from '@root/types/plex.types.js'
import { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import { RssEtagPoller } from '@services/plex-watchlist/rss/rss-etag-poller.js'
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
  isUsingRssFallback: boolean
  /** RSS ETag poller instance (null if RSS mode disabled) */
  rssEtagPoller: RssEtagPoller | null
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
  let isUsingRssFallback = false
  let rssEtagPoller: RssEtagPoller | null = null
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
    const rssFeeds = await deps.plexService.generateAndSaveRssFeeds()

    if ('error' in rssFeeds) {
      deps.logger.warn(
        { error: rssFeeds.error },
        'Failed to generate RSS feeds, falling back to manual sync',
      )
      isUsingRssFallback = true
      rssMode = false
    } else {
      // Initialize RSS monitoring if feeds were generated successfully
      deps.logger.debug(
        'RSS feeds generated successfully, initializing monitoring',
      )
      // Initialize RSS ETag poller for efficient HEAD-based change detection
      rssEtagPoller = new RssEtagPoller(deps.logger)
      // Initialize RSS feed cache for item diffing and author tracking
      rssFeedCache = new RssFeedCacheManager(deps.logger)
      isUsingRssFallback = false
      rssMode = true
    }
  } catch (rssError) {
    deps.logger.error(
      { error: rssError },
      'Error generating or initializing RSS feeds',
    )
    throw new Error('Failed to generate or initialize RSS feeds', {
      cause: rssError,
    })
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
    isUsingRssFallback,
    rssEtagPoller,
    rssFeedCache,
    deferredRoutingQueue,
  }
}
