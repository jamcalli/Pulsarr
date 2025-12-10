/**
 * Staggered Poller Module
 *
 * Handles staggered polling for non-RSS mode.
 * Polls users sequentially with even distribution across 5-minute cycles.
 */

import type {
  EtagPollResult,
  EtagUserInfo,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import { processItemsForUser } from '@services/plex-watchlist/index.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '../routing/index.js'
import type { StaggeredPollerDeps } from '../types.js'
import { buildEtagUserInfoFromMap } from './helpers.js'

/**
 * Handle a staggered poll result when a user has new items.
 *
 * @param result - The poll result from EtagPoller
 * @param deps - Service dependencies
 */
export async function handleStaggeredPollResult(
  result: EtagPollResult,
  deps: StaggeredPollerDeps,
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

  // Check instance health
  const health = await checkInstanceHealth({
    sonarrManager: deps.sonarrManager,
    radarrManager: deps.radarrManager,
    deferredRoutingQueue: deps.deferredRoutingQueue,
    logger: deps.logger,
  })

  // Convert EtagPollItems to TokenWatchlistItems
  const tokenItems: TokenWatchlistItem[] = result.newItems.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    user_id: result.userId,
    status: 'pending' as const,
    key: item.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  if (!health.available && deps.deferredRoutingQueue) {
    deps.logger.warn(
      {
        userId: result.userId,
        itemCount: tokenItems.length,
      },
      'Instances unavailable, queuing items for deferred routing',
    )

    // Process through DB first (ensures items are persisted), then queue for routing
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

    // Queue BOTH processed and linked items - linked items also need routing
    // because this user may have different router rules than the original owner
    const allItemsToQueue: Item[] = [...processedItems, ...linkedItems]
    if (allItemsToQueue.length > 0) {
      deps.deferredRoutingQueue.enqueue({
        type: 'items',
        userId: result.userId,
        items: allItemsToQueue,
      })
    }
    return
  }

  // Process and route items
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

  const allItemsToRoute: Item[] = [...processedItems, ...linkedItems]
  if (allItemsToRoute.length > 0) {
    await deps.routeEnrichedItemsForUser(result.userId, allItemsToRoute)
    await deps.updateAutoApprovalUserAttribution()
    deps.scheduleDebouncedStatusSync()
  }
}

/**
 * Refresh friends list at the start of each staggered polling cycle.
 *
 * This method:
 * 1. Detects new Plex friends → creates DB user → syncs watchlist → establishes baseline
 * 2. Detects removed friends → invalidates ETag cache → removes from UUID cache
 * 3. Returns updated friends list for the polling rotation
 *
 * New friends are immediately synced and added to the current cycle's rotation.
 *
 * @param plexUuidCache - Current UUID cache (for removal cleanup)
 * @param deps - Service dependencies
 * @returns Updated friends list and updated cache
 */
export async function refreshFriendsForStaggeredPolling(
  plexUuidCache: Map<string, number>,
  deps: StaggeredPollerDeps,
): Promise<{ friends: EtagUserInfo[]; updatedCache: Map<string, number> }> {
  let currentCache = plexUuidCache

  try {
    const friendChanges = await deps.plexService.checkFriendChanges()
    deps.updatePlexUuidCache(friendChanges.userMap)
    currentCache = new Map(friendChanges.userMap)

    // Check instance health once before processing new friends
    // Health status won't change during a single refresh cycle
    const health =
      friendChanges.added.length > 0
        ? await checkInstanceHealth({
            sonarrManager: deps.sonarrManager,
            radarrManager: deps.radarrManager,
            deferredRoutingQueue: deps.deferredRoutingQueue,
            logger: deps.logger,
          })
        : null

    // Handle new friends - sync immediately and establish baseline
    for (const newFriend of friendChanges.added) {
      deps.logger.info(
        { username: newFriend.username, userId: newFriend.userId },
        'New friend detected in staggered polling cycle',
      )

      try {
        // Sync new friend's watchlist
        const { brandNewItems, linkedItems } = await deps.syncSingleFriend({
          userId: newFriend.userId,
          username: newFriend.username,
          isPrimary: false,
          watchlistId: newFriend.watchlistId,
        })

        // Route ALL items - both brand new AND linked (matches ETag mode behavior)
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
              },
              'Some instances unavailable, queuing new friend items for deferred routing',
            )

            queueForDeferredRouting(
              {
                sonarrManager: deps.sonarrManager,
                radarrManager: deps.radarrManager,
                deferredRoutingQueue: deps.deferredRoutingQueue,
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

            await deps.routeEnrichedItemsForUser(
              newFriend.userId,
              allItemsToRoute,
            )

            await deps.updateAutoApprovalUserAttribution()
            deps.scheduleDebouncedStatusSync()
          }
        }

        // Establish baseline for new friend
        if (deps.etagPoller) {
          await deps.etagPoller.establishBaseline({
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

    // Handle removed friends - clean up cache
    for (const removed of friendChanges.removed) {
      deps.logger.info(
        { userId: removed.userId, username: removed.username },
        'Friend removed, cleaning up from staggered polling',
      )

      if (deps.etagPoller) {
        deps.etagPoller.invalidateUser(removed.userId, removed.watchlistId)
      }

      // Remove from UUID cache
      for (const [uuid, userId] of currentCache.entries()) {
        if (userId === removed.userId) {
          currentCache.delete(uuid)
          break
        }
      }
    }

    // Return updated friends list
    const friends = await getEtagFriendsList(deps)
    return { friends, updatedCache: currentCache }
  } catch (error) {
    deps.logger.error(
      { error },
      'Failed to refresh friends for staggered polling',
    )
    // Return current list on error
    const friends = await getEtagFriendsList(deps)
    return { friends, updatedCache: currentCache }
  }
}

/**
 * Get friends list formatted for EtagPoller.
 *
 * Note: Uses checkFriendChanges() which also ensures users exist in DB.
 * This is intentional - after initial reconciliation, existing users are
 * returned with no side effects. New users are created if Plex friends
 * changed between calls, which is the desired behavior.
 *
 * @param deps - Service dependencies
 * @returns Array of EtagUserInfo for friends
 */
export async function getEtagFriendsList(
  deps: Pick<StaggeredPollerDeps, 'plexService'>,
): Promise<EtagUserInfo[]> {
  const friendChanges = await deps.plexService.checkFriendChanges()
  return buildEtagUserInfoFromMap(friendChanges.userMap)
}
