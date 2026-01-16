/**
 * Workflow Stopper Module
 *
 * Handles workflow cleanup operations for pollers, caches, and queues.
 * Timer cleanup remains in the service since timers are service-level state.
 */

import type { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import type { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import type { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for workflow cleanup
 */
export interface WorkflowStopDeps {
  logger: FastifyBaseLogger
  /** Callback to cleanup existing manual sync jobs */
  cleanupExistingManualSync: () => Promise<void>
}

/**
 * Components to clean up
 */
export interface WorkflowComponents {
  /** ETag poller instance */
  etagPoller: EtagPoller | null
  /** RSS feed cache manager instance */
  rssFeedCache: RssFeedCacheManager | null
  /** Deferred routing queue instance */
  deferredRoutingQueue: DeferredRoutingQueue | null
}

/**
 * Result of workflow cleanup with updated component references
 */
export interface WorkflowCleanupResult {
  /** RSS feed cache (set to null after cleanup) */
  rssFeedCache: null
  /** Deferred routing queue (set to null after cleanup) */
  deferredRoutingQueue: null
}

/**
 * Clean up workflow components.
 *
 * This function handles:
 * 1. Cleaning up periodic reconciliation jobs
 * 2. Stopping staggered polling and clearing ETag caches
 * 3. Clearing RSS feed cache
 * 4. Stopping the deferred routing queue
 *
 * Timer cleanup (rssCheckInterval, etagCheckInterval, statusSyncDebounceTimer)
 * remains in the service since timers are service-level state.
 *
 * @param components - Components to clean up
 * @param deps - Cleanup dependencies
 * @returns Result with nulled component references
 */
export async function cleanupWorkflow(
  components: WorkflowComponents,
  deps: WorkflowStopDeps,
): Promise<WorkflowCleanupResult> {
  // Clean up periodic reconciliation job regardless of mode
  try {
    await deps.cleanupExistingManualSync()
  } catch (error) {
    deps.logger.error(
      { error },
      'Error cleaning up periodic reconciliation during shutdown',
    )
  }

  // Stop staggered polling and clear watchlist cache
  if (components.etagPoller) {
    components.etagPoller.stopStaggeredPolling()
    components.etagPoller.clearCache()
  }

  // Clear RSS feed cache
  if (components.rssFeedCache) {
    components.rssFeedCache.clearCaches()
  }

  // Stop deferred routing queue (drops any queued items)
  if (components.deferredRoutingQueue) {
    components.deferredRoutingQueue.stop()
  }

  return {
    rssFeedCache: null,
    deferredRoutingQueue: null,
  }
}
