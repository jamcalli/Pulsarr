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

async function handleEtagModeChanges(
  changes: Awaited<ReturnType<EtagPoller['checkAllEtags']>>,
  deps: WorkflowDeps,
): Promise<void> {
  const { signal } = deps.state
  const changesWithNewItems = changes.filter(
    (c) => c.changed && c.newItems.length > 0,
  )

  if (changesWithNewItems.length === 0) {
    return
  }

  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    plexServerService: deps.fastify.plexServerService,
    skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
    deferredRoutingQueue: deps.state.deferredRoutingQueue,
    logger: deps.logger,
  })
  if (signal.aborted) return

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
    if (signal.aborted) return
    await routeNewItemsForUser(change, deps)
  }

  if (signal.aborted) return
  await updateAutoApprovalUserAttribution(deps)
  deps.state.scheduleDebouncedStatusSync(deps)
}

export async function reconcile(
  options: { mode: 'full' | 'etag' },
  deps: WorkflowDeps,
): Promise<void> {
  if (options.mode === 'full') {
    await waitForInProgressReconciliation(deps.state, deps.logger)
  } else {
    if (deps.state.isReconciling) {
      deps.logger.debug(
        { requestedMode: options.mode },
        'Reconciliation already in progress, skipping',
      )
      return
    }
  }

  deps.state.isReconciling = true
  // a restart mid-sync opens a new signal; this sync answers only to the one it started under
  const { signal } = deps.state
  const startTime = Date.now()

  try {
    const etagPoller = deps.state.ensureEtagPoller(
      () => deps.config,
      deps.logger,
    )

    const primaryUser = await deps.db.getPrimaryUser()
    if (!primaryUser) {
      deps.logger.warn('No primary user found, cannot reconcile')
      return
    }

    const friendChanges = await deps.plexService.checkFriendChanges()
    if (signal.aborted) return

    deps.state.updatePlexUuidCache(friendChanges.userMap, deps.logger)

    for (const newFriend of friendChanges.added) {
      if (signal.aborted) return
      if (options.mode === 'etag') {
        await handleNewFriendEtagMode(newFriend, deps)
      } else {
        await handleNewFriendFullMode(newFriend, deps)
      }
    }

    for (const removedFriend of friendChanges.removed) {
      handleRemovedFriend(removedFriend, deps)
    }

    const friends: EtagUserInfo[] = buildEtagUserInfoFromMap(
      friendChanges.userMap,
    )

    if (options.mode === 'full') {
      deps.logger.info('Starting full reconciliation')
      await fetchWatchlists(deps)
      if (signal.aborted) return
      await syncWatchlistItems(deps)
      if (signal.aborted) return

      await etagPoller.establishAllBaselines(primaryUser.id, friends)

      deps.state.lastSuccessfulSyncTime = Date.now()
      deps.logger.info('Full reconciliation completed')
    } else {
      deps.logger.debug('Checking for watchlist changes')

      const changes = await etagPoller.checkAllEtags(primaryUser.id, friends)

      if (changes.length === 0) {
        deps.logger.debug('No watchlist changes detected')
        return
      }

      await handleEtagModeChanges(changes, deps)
      if (signal.aborted) return

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
