/**
 * Reconciler Module
 *
 * Main reconciliation entry point that coordinates the hybrid RSS + ETag sync.
 * Handles both full sync and lightweight ETag-based change detection.
 */

import type { EtagUserInfo } from '@root/types/plex.types.js'
import type { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { updateAutoApprovalUserAttribution } from '../attribution/approval-attributor.js'
import { buildEtagUserInfoFromMap } from '../etag/helpers.js'
import { fetchWatchlists } from '../fetching/watchlist-fetcher.js'
import { checkInstanceHealth } from '../routing/health-checker.js'
import { routeNewItemsForUser } from '../routing/item-router.js'
import type { WorkflowState } from '../state.js'
import type { WorkflowDeps } from '../types.js'
import {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
} from './friend-handler.js'
import { syncWatchlistItems } from './sync-engine.js'

/**
 * Wait for any in-progress reconciliation to complete.
 *
 * @param state - Current reconciliation state
 * @param logger - Logger instance
 * @param maxWaitMs - Maximum time to wait (default 5 minutes)
 * @returns true if we should proceed, false if timed out
 */
async function waitForInProgressReconciliation(
  state: WorkflowState,
  logger: WorkflowDeps['logger'],
  maxWaitMs = 5 * 60 * 1000,
): Promise<boolean> {
  const startWait = Date.now()

  while (state.isReconciling) {
    if (Date.now() - startWait > maxWaitMs) {
      logger.warn(
        'Timeout waiting for in-progress reconciliation, proceeding with full sync',
      )
      return true
    }
    logger.debug('Waiting for in-progress reconciliation before full sync')
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return true
}

/**
 * Handle ETag mode changes - route new items for users with changes.
 *
 * @param changes - ETag poll results with new items
 * @param deps - Service dependencies
 */
async function handleEtagModeChanges(
  changes: Awaited<ReturnType<EtagPoller['checkAllEtags']>>,
  deps: WorkflowDeps,
): Promise<void> {
  const changesWithNewItems = changes.filter(
    (c) => c.changed && c.newItems.length > 0,
  )

  if (changesWithNewItems.length === 0) {
    return
  }

  // Check instance health before routing - queue if ANY instance is unavailable
  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    plexServerService: deps.fastify.plexServerService,
    skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
    deferredRoutingQueue: deps.state.deferredRoutingQueue,
    logger: deps.logger,
  })

  if (!health.available) {
    deps.logger.warn(
      {
        sonarrUnavailable: health.sonarrUnavailable,
        radarrUnavailable: health.radarrUnavailable,
        plexServerUnreachable: health.plexServerUnreachable,
        changesCount: changesWithNewItems.length,
      },
      'Some instances unavailable, queuing changes for deferred routing',
    )

    // Queue each change for retry when instances recover
    if (deps.state.deferredRoutingQueue) {
      for (const change of changesWithNewItems) {
        deps.state.deferredRoutingQueue.enqueue({ type: 'etag', change })
      }
    }
    return
  }

  deps.logger.info(
    {
      users: changesWithNewItems.length,
      items: changesWithNewItems.reduce((sum, c) => sum + c.newItems.length, 0),
    },
    'New watchlist items detected',
  )

  for (const change of changesWithNewItems) {
    await routeNewItemsForUser(change, deps)
  }

  // Post-routing tasks
  await updateAutoApprovalUserAttribution(deps)
  deps.state.scheduleDebouncedStatusSync(deps)
}

/**
 * Unified reconciliation entry point for hybrid RSS + ETag sync.
 *
 * @param options.mode - 'full' for complete sync, 'etag' for lightweight ETag-based check
 * @param deps - Service dependencies
 *
 * Full mode (startup, manual refresh):
 * - Syncs all users, all items
 * - Establishes ETag baselines
 *
 * ETag mode (5-min interval, RSS trigger):
 * - Checks friend changes (add/remove)
 * - Checks ETags for all users
 * - Only syncs users with changes (instant routing of new items)
 */
export async function reconcile(
  options: { mode: 'full' | 'etag' },
  deps: WorkflowDeps,
): Promise<void> {
  // Full sync takes priority - wait for any in-progress reconciliation
  if (options.mode === 'full') {
    await waitForInProgressReconciliation(deps.state, deps.logger)
  } else {
    // ETag mode skips if anything is running
    if (deps.state.isReconciling) {
      deps.logger.debug(
        { requestedMode: options.mode },
        'Reconciliation already in progress, skipping',
      )
      return
    }
  }

  deps.state.isReconciling = true
  const startTime = Date.now()

  try {
    const etagPoller = deps.state.ensureEtagPoller(deps.config, deps.logger)

    // Get primary user for ETag operations
    const primaryUser = await deps.db.getPrimaryUser()
    if (!primaryUser) {
      deps.logger.warn('No primary user found, cannot reconcile')
      return
    }

    // Check friend changes ALWAYS (regardless of mode)
    const friendChanges = await deps.plexService.checkFriendChanges()

    // Update UUID cache with current friends mapping
    deps.state.updatePlexUuidCache(friendChanges.userMap, deps.logger)

    // Handle newly added friends immediately
    for (const newFriend of friendChanges.added) {
      if (options.mode === 'etag') {
        await handleNewFriendEtagMode(newFriend, deps)
      } else {
        await handleNewFriendFullMode(newFriend, deps)
      }
    }

    // Handle removed friends - clear their watchlist cache
    for (const removedFriend of friendChanges.removed) {
      handleRemovedFriend(removedFriend, deps)
    }

    // Build user info array for current friends
    const friends: EtagUserInfo[] = buildEtagUserInfoFromMap(
      friendChanges.userMap,
    )

    if (options.mode === 'full') {
      // Full sync - existing behavior
      deps.logger.info('Starting full reconciliation')
      await fetchWatchlists(deps)
      await syncWatchlistItems(deps)

      // Establish ETag baselines for all users after full sync
      await etagPoller.establishAllBaselines(primaryUser.id, friends)

      deps.state.lastSuccessfulSyncTime = Date.now()
      deps.logger.info('Full reconciliation completed')
    } else {
      // Lightweight check with instant routing
      deps.logger.debug('Checking for watchlist changes')

      const changes = await etagPoller.checkAllEtags(primaryUser.id, friends)

      if (changes.length === 0) {
        deps.logger.debug('No watchlist changes detected')
        return
      }

      await handleEtagModeChanges(changes, deps)

      deps.state.lastSuccessfulSyncTime = Date.now()
      deps.logger.debug('Watchlist change check completed')
    }
  } finally {
    deps.logger.debug(
      { mode: options.mode, durationMs: Date.now() - startTime },
      'Reconciliation completed',
    )
    deps.state.isReconciling = false
  }
}
