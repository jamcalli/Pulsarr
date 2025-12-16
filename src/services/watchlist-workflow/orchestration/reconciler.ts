/**
 * Reconciler Module
 *
 * Main reconciliation entry point that coordinates the hybrid RSS + ETag sync.
 * Handles both full sync and lightweight ETag-based change detection.
 */

import type {
  EtagUserInfo,
  Item,
  UserMapEntry,
} from '@root/types/plex.types.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { buildEtagUserInfoFromMap } from '../etag/index.js'
import { checkInstanceHealth } from '../routing/index.js'
import type { ReconcilerDeps } from '../types.js'
import {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
} from './friend-handler.js'

/**
 * Reconciliation state managed by the service
 */
export interface ReconcileState {
  isReconciling: boolean
  lastSuccessfulSyncTime: number
}

/**
 * Dependencies for reconciliation that include state management
 */
export interface ReconcileDeps extends ReconcilerDeps {
  /** Function to get current ETag poller (may be lazily initialized) */
  getEtagPoller: () => EtagPoller | null
  /** Function to set ETag poller after lazy initialization */
  setEtagPoller: (poller: EtagPoller) => void
  /** Callback for syncing a single friend's watchlist */
  syncSingleFriend: (userInfo: {
    userId: number
    username: string
    isPrimary: boolean
    watchlistId?: string
  }) => Promise<{
    brandNewItems: Item[]
    linkedItems: Item[]
  }>
  /** Callback for updating UUID cache */
  updatePlexUuidCache: (userMap: Map<string, UserMapEntry>) => void
}

/**
 * Wait for any in-progress reconciliation to complete.
 *
 * @param state - Current reconciliation state
 * @param logger - Logger instance
 * @param maxWaitMs - Maximum time to wait (default 5 minutes)
 * @returns true if we should proceed, false if timed out
 */
async function waitForInProgressReconciliation(
  state: ReconcileState,
  logger: ReconcileDeps['logger'],
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
  deps: ReconcileDeps,
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
    deferredRoutingQueue: deps.deferredRoutingQueue,
    logger: deps.logger,
  })

  if (!health.available) {
    deps.logger.warn(
      {
        sonarrUnavailable: health.sonarrUnavailable,
        radarrUnavailable: health.radarrUnavailable,
        changesCount: changesWithNewItems.length,
      },
      'Some instances unavailable, queuing changes for deferred routing',
    )

    // Queue each change for retry when instances recover
    if (deps.deferredRoutingQueue) {
      for (const change of changesWithNewItems) {
        deps.deferredRoutingQueue.enqueue({ type: 'etag', change })
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
    await deps.routeNewItemsForUser(change)
  }

  // Post-routing tasks
  await deps.updateAutoApprovalUserAttribution()
  deps.scheduleDebouncedStatusSync()
}

/**
 * Unified reconciliation entry point for hybrid RSS + ETag sync.
 *
 * @param options.mode - 'full' for complete sync, 'etag' for lightweight ETag-based check
 * @param deps - Service dependencies
 * @param state - Current reconciliation state
 * @param setState - Function to update state
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
  deps: ReconcileDeps,
  state: ReconcileState,
  setState: (updates: Partial<ReconcileState>) => void,
): Promise<void> {
  // Full sync takes priority - wait for any in-progress reconciliation
  if (options.mode === 'full') {
    await waitForInProgressReconciliation(state, deps.logger)
  } else {
    // ETag mode skips if anything is running
    if (state.isReconciling) {
      deps.logger.debug(
        { requestedMode: options.mode },
        'Reconciliation already in progress, skipping',
      )
      return
    }
  }

  setState({ isReconciling: true })
  const startTime = Date.now()

  try {
    // Ensure ETag poller is initialized
    let etagPoller = deps.getEtagPoller()
    if (!etagPoller) {
      etagPoller = new EtagPoller(deps.config, deps.logger)
      deps.setEtagPoller(etagPoller)
    }

    // Get primary user for ETag operations
    const primaryUser = await deps.db.getPrimaryUser()
    if (!primaryUser) {
      deps.logger.warn('No primary user found, cannot reconcile')
      return
    }

    // Check friend changes ALWAYS (regardless of mode)
    const friendChanges = await deps.plexService.checkFriendChanges()

    // Update UUID cache with current friends mapping
    deps.updatePlexUuidCache(friendChanges.userMap)

    // Handle newly added friends immediately
    for (const newFriend of friendChanges.added) {
      if (options.mode === 'etag') {
        // Build FriendHandlerDeps by combining ReconcilerDeps with additional required fields
        await handleNewFriendEtagMode(newFriend, {
          // From ReconcilerDeps (via deps)
          logger: deps.logger,
          config: deps.config,
          db: deps.db,
          fastify: deps.fastify,
          plexService: deps.plexService,
          sonarrManager: deps.sonarrManager,
          radarrManager: deps.radarrManager,
          etagPoller,
          deferredRoutingQueue: deps.deferredRoutingQueue,
          syncWatchlistItems: deps.syncWatchlistItems,
          fetchWatchlists: deps.fetchWatchlists,
          routeNewItemsForUser: deps.routeNewItemsForUser,
          routeEnrichedItemsForUser: deps.routeEnrichedItemsForUser,
          updateAutoApprovalUserAttribution:
            deps.updateAutoApprovalUserAttribution,
          scheduleDebouncedStatusSync: deps.scheduleDebouncedStatusSync,
          // Additional FriendHandlerDeps fields
          lookupUserByUuid: async () => null, // Not needed for new friend handling
          updatePlexUuidCache: deps.updatePlexUuidCache,
          syncSingleFriend: deps.syncSingleFriend,
        })
      } else {
        await handleNewFriendFullMode(newFriend, {
          logger: deps.logger,
          etagPoller,
        })
      }
    }

    // Handle removed friends - clear their watchlist cache
    for (const removedFriend of friendChanges.removed) {
      handleRemovedFriend(removedFriend, {
        logger: deps.logger,
        etagPoller,
      })
    }

    // Build user info array for current friends
    const friends: EtagUserInfo[] = buildEtagUserInfoFromMap(
      friendChanges.userMap,
    )

    if (options.mode === 'full') {
      // Full sync - existing behavior
      deps.logger.info('Starting full reconciliation')
      await deps.fetchWatchlists()
      await deps.syncWatchlistItems()

      // Establish ETag baselines for all users after full sync
      await etagPoller.establishAllBaselines(primaryUser.id, friends)

      setState({ lastSuccessfulSyncTime: Date.now() })
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

      setState({ lastSuccessfulSyncTime: Date.now() })
      deps.logger.debug('Watchlist change check completed')
    }
  } finally {
    deps.logger.debug(
      { mode: options.mode, durationMs: Date.now() - startTime },
      'Reconciliation completed',
    )
    setState({ isReconciling: false })
  }
}
