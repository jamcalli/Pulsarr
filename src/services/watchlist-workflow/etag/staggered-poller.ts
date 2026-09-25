import type {
  EtagPollResult,
  EtagUserInfo,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { processItemsForUser } from '@services/plex-watchlist/index.js'
import { updateAutoApprovalUserAttribution } from '../attribution/approval-attributor.js'
import { syncSingleFriend } from '../orchestration/friend-handler.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '../routing/health-checker.js'
import { routeEnrichedItemsForUser } from '../routing/item-router.js'
import type { WorkflowDeps } from '../types.js'
import { buildEtagUserInfoFromMap } from './helpers.js'

export async function handleStaggeredPollResult(
  result: EtagPollResult,
  deps: WorkflowDeps,
): Promise<void> {
  if (!result.changed || result.newItems.length === 0) return

  const user = await deps.db.getUser(result.userId)
  if (!user) {
    deps.logger.warn(
      { userId: result.userId },
      'User not found for staggered poll result',
    )
    return
  }

  deps.logger.info(
    {
      userId: result.userId,
      username: user.name,
      newItems: result.newItems.length,
    },
    'Staggered poll detected new items',
  )

  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    plexServerService: deps.fastify.plexServerService,
    skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
    deferredRoutingQueue: deps.state.deferredRoutingQueue,
    logger: deps.logger,
  })

  const now = new Date().toISOString()
  const tokenItems: TokenWatchlistItem[] = result.newItems.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    user_id: result.userId,
    status: 'pending' as const,
    key: item.id,
    created_at: now,
    updated_at: now,
  }))

  if (!health.available && deps.state.deferredRoutingQueue) {
    deps.logger.warn(
      {
        userId: result.userId,
        itemCount: tokenItems.length,
        sonarrUnavailable: health.sonarrUnavailable,
        radarrUnavailable: health.radarrUnavailable,
        plexServerUnreachable: health.plexServerUnreachable,
      },
      'Instances unavailable, queuing items for deferred routing',
    )

    const { processedItems, linkedItems } = await processItemsForUser(
      {
        user: {
          userId: result.userId,
          username: user.name,
          watchlistId: '',
        },
        items: tokenItems,
        isSelfWatchlist: result.isPrimary,
      },
      deps.itemProcessorDeps,
    )

    if (deps.state.signal.aborted) return

    // Linked items need routing too: this user may have different router rules than the owner
    const allItemsToQueue: Item[] = [...processedItems, ...linkedItems]
    if (allItemsToQueue.length > 0) {
      deps.state.deferredRoutingQueue.enqueue({
        type: 'items',
        userId: result.userId,
        items: allItemsToQueue,
      })
    }
    return
  }

  const { processedItems, linkedItems } = await processItemsForUser(
    {
      user: {
        userId: result.userId,
        username: user.name,
        watchlistId: '',
      },
      items: tokenItems,
      isSelfWatchlist: result.isPrimary,
    },
    deps.itemProcessorDeps,
  )

  if (deps.state.signal.aborted) return

  const allItemsToRoute: Item[] = [...processedItems, ...linkedItems]
  if (allItemsToRoute.length > 0) {
    await routeEnrichedItemsForUser(result.userId, allItemsToRoute, deps)
    await updateAutoApprovalUserAttribution(deps)
    deps.state.scheduleDebouncedStatusSync(deps)
  }
}

export async function refreshFriendsForStaggeredPolling(
  deps: WorkflowDeps,
): Promise<EtagUserInfo[]> {
  try {
    const friendChanges = await deps.plexService.checkFriendChanges()

    if (deps.state.signal.aborted) {
      return buildEtagUserInfoFromMap(deps.state.plexUuidCache)
    }

    deps.state.updatePlexUuidCache(friendChanges.userMap, deps.logger)

    // Health is checked once per cycle: it will not change mid-refresh
    const health =
      friendChanges.added.length > 0
        ? await checkInstanceHealth({
            sonarrManager: deps.sonarrManager,
            radarrManager: deps.radarrManager,
            plexServerService: deps.fastify.plexServerService,
            skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
            deferredRoutingQueue: deps.state.deferredRoutingQueue,
            logger: deps.logger,
          })
        : null

    for (const newFriend of friendChanges.added) {
      deps.logger.info(
        { username: newFriend.username, userId: newFriend.userId },
        'New friend detected in staggered polling cycle',
      )

      try {
        const { brandNewItems, linkedItems } = await syncSingleFriend(
          {
            userId: newFriend.userId,
            username: newFriend.username,
            isPrimary: false,
            watchlistId: newFriend.watchlistId,
          },
          deps,
        )

        if (deps.state.signal.aborted) {
          return buildEtagUserInfoFromMap(deps.state.plexUuidCache)
        }

        const allItemsToRoute: Item[] = [...brandNewItems, ...linkedItems]

        if (allItemsToRoute.length > 0) {
          if (!health?.available) {
            deps.logger.warn(
              {
                userId: newFriend.userId,
                username: newFriend.username,
                itemCount: allItemsToRoute.length,
                sonarrUnavailable: health?.sonarrUnavailable,
                radarrUnavailable: health?.radarrUnavailable,
                plexServerUnreachable: health?.plexServerUnreachable,
              },
              'Some instances unavailable, queuing new friend items for deferred routing',
            )

            queueForDeferredRouting(
              {
                sonarrManager: deps.sonarrManager,
                radarrManager: deps.radarrManager,
                deferredRoutingQueue: deps.state.deferredRoutingQueue,
                logger: deps.logger,
              },
              {
                type: 'items',
                userId: newFriend.userId,
                items: allItemsToRoute,
              },
              'staggered-new-friend',
            )
          } else {
            deps.logger.info(
              {
                userId: newFriend.userId,
                brandNew: brandNewItems.length,
                linked: linkedItems.length,
                total: allItemsToRoute.length,
              },
              'Routing new friend watchlist items (brand new + linked)',
            )

            await routeEnrichedItemsForUser(
              newFriend.userId,
              allItemsToRoute,
              deps,
            )

            await updateAutoApprovalUserAttribution(deps)
            deps.state.scheduleDebouncedStatusSync(deps)
          }
        }

        if (deps.state.etagPoller) {
          await deps.state.etagPoller.establishBaseline({
            userId: newFriend.userId,
            username: newFriend.username,
            isPrimary: false,
            watchlistId: newFriend.watchlistId,
          })
        }
      } catch (error) {
        deps.logger.error(
          { error, username: newFriend.username },
          'Failed to sync new friend in staggered polling',
        )
      }
    }

    for (const removed of friendChanges.removed) {
      deps.logger.info(
        { userId: removed.userId, username: removed.username },
        'Friend removed, cleaning up from staggered polling',
      )

      if (deps.state.etagPoller) {
        deps.state.etagPoller.invalidateUser(
          removed.userId,
          removed.watchlistId,
        )
      }

      for (const [uuid, entry] of deps.state.plexUuidCache.entries()) {
        if (entry.userId === removed.userId) {
          deps.state.plexUuidCache.delete(uuid)
          break
        }
      }
    }

    return buildEtagUserInfoFromMap(deps.state.plexUuidCache)
  } catch (error) {
    deps.logger.error(
      { error },
      'Failed to refresh friends for staggered polling',
    )
    return buildEtagUserInfoFromMap(deps.state.plexUuidCache)
  }
}

// checkFriendChanges also creates DB users for Plex friends added since the last call
export async function getEtagFriendsList(
  deps: Pick<WorkflowDeps, 'plexService'>,
): Promise<EtagUserInfo[]> {
  const friendChanges = await deps.plexService.checkFriendChanges()
  return buildEtagUserInfoFromMap(friendChanges.userMap)
}

export async function startStaggeredPolling(deps: WorkflowDeps): Promise<void> {
  const etagPoller = deps.state.ensureEtagPoller(() => deps.config, deps.logger)

  const primaryUser = await deps.db.getPrimaryUser()
  if (!primaryUser) {
    deps.logger.warn('No primary user found, cannot start staggered polling')
    return
  }

  const friends = await getEtagFriendsList(deps)

  etagPoller.startStaggeredPolling(
    primaryUser.id,
    friends,
    (result) => handleStaggeredPollResult(result, deps),
    () => refreshFriendsForStaggeredPolling(deps),
  )
}
