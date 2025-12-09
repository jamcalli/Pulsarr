/**
 * Friend Handler Module
 *
 * Handles new friend detection, watchlist syncing, and baseline establishment.
 */

import type { EtagUserInfo } from '@root/types/plex.types.js'
import { checkHealthAndQueueIfUnavailable } from '../routing/index.js'
import type { FriendHandlerDeps } from '../types.js'

/**
 * Result of handling a new friend
 */
export interface NewFriendHandlerResult {
  success: boolean
  itemsRouted: number
  error?: Error
}

/**
 * Handle a newly detected friend in ETag mode.
 *
 * Syncs the friend's watchlist, routes items if instances are available,
 * or queues for deferred routing if not.
 *
 * @param newFriend - The new friend info
 * @param deps - Service dependencies
 * @returns Result of handling the new friend
 */
export async function handleNewFriendEtagMode(
  newFriend: EtagUserInfo,
  deps: FriendHandlerDeps,
): Promise<NewFriendHandlerResult> {
  deps.logger.info(
    { userId: newFriend.userId, username: newFriend.username },
    'New friend detected',
  )

  try {
    const { brandNewItems, linkedItems } =
      await deps.syncSingleFriend(newFriend)

    // Route ALL items - both brand new AND linked
    // Linked items need routing because this user may have different router rules
    const allItemsToRoute = [...brandNewItems, ...linkedItems]

    if (allItemsToRoute.length > 0) {
      // Check instance health before routing - queue if unavailable
      const { health, shouldRoute } = await checkHealthAndQueueIfUnavailable(
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
        'new-friend',
      )

      if (!shouldRoute) {
        deps.logger.warn(
          {
            userId: newFriend.userId,
            username: newFriend.username,
            itemCount: allItemsToRoute.length,
            sonarrUnavailable: health.sonarrUnavailable,
            radarrUnavailable: health.radarrUnavailable,
          },
          'Some instances unavailable, queued new friend items for deferred routing',
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

        // Route pre-enriched items (no double enrichment)
        await deps.routeEnrichedItemsForUser(newFriend.userId, allItemsToRoute)

        // Post-routing tasks - update attribution and schedule status sync
        await deps.updateAutoApprovalUserAttribution()
        deps.scheduleDebouncedStatusSync()
      }
    }

    // Only establish baseline after successful sync
    // If sync failed, next full reconciliation will handle this friend
    if (deps.etagPoller) {
      await deps.etagPoller.establishBaseline(newFriend)
    }

    return { success: true, itemsRouted: allItemsToRoute.length }
  } catch (error) {
    deps.logger.error(
      { userId: newFriend.userId, username: newFriend.username, error },
      'Failed to sync new friend - will retry on next full reconciliation',
    )
    // Don't establish baseline - let full reconciliation handle this friend
    return {
      success: false,
      itemsRouted: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Handle a newly detected friend in full sync mode.
 *
 * In full mode, fetchWatchlists() handles the friend's items.
 * This just establishes the baseline for future change detection.
 *
 * @param newFriend - The new friend info
 * @param deps - Service dependencies
 */
export async function handleNewFriendFullMode(
  newFriend: EtagUserInfo,
  deps: Pick<FriendHandlerDeps, 'logger' | 'etagPoller'>,
): Promise<void> {
  deps.logger.info(
    { userId: newFriend.userId, username: newFriend.username },
    'New friend detected',
  )

  // Full mode: fetchWatchlists() will handle this friend's items
  // Establish baseline for future change detection
  if (deps.etagPoller) {
    await deps.etagPoller.establishBaseline(newFriend)
  }
}

/**
 * Handle a removed friend.
 *
 * Clears the friend's watchlist cache from the ETag poller.
 *
 * @param removedFriend - The removed friend info
 * @param deps - Service dependencies
 */
export function handleRemovedFriend(
  removedFriend: EtagUserInfo,
  deps: Pick<FriendHandlerDeps, 'logger' | 'etagPoller'>,
): void {
  deps.logger.info(
    { userId: removedFriend.userId, username: removedFriend.username },
    'Friend removed, clearing watchlist cache',
  )

  if (deps.etagPoller) {
    deps.etagPoller.invalidateUser(
      removedFriend.userId,
      removedFriend.watchlistId,
    )
  }
}

/**
 * Process friend changes during reconciliation.
 *
 * Handles all added and removed friends, updating the UUID cache.
 *
 * @param params - Friend changes and mode
 * @param deps - Service dependencies
 */
export async function processFriendChanges(
  params: {
    added: EtagUserInfo[]
    removed: EtagUserInfo[]
    userMap: Map<string, number>
    mode: 'full' | 'etag'
  },
  deps: FriendHandlerDeps,
): Promise<void> {
  const { added, removed, userMap, mode } = params

  // Update UUID cache with current friends mapping
  deps.updatePlexUuidCache(userMap)

  // Handle newly added friends
  for (const newFriend of added) {
    if (mode === 'etag') {
      await handleNewFriendEtagMode(newFriend, deps)
    } else {
      await handleNewFriendFullMode(newFriend, deps)
    }
  }

  // Handle removed friends
  for (const removedFriend of removed) {
    handleRemovedFriend(removedFriend, deps)
  }
}
