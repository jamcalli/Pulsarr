/**
 * Friend Handler Module
 *
 * Handles new friend detection, watchlist syncing, and baseline establishment.
 */

import type {
  EtagUserInfo,
  Friend,
  Item,
  UserMapEntry,
} from '@root/types/plex.types.js'
import {
  categorizeItems,
  extractKeysAndRelationships,
  getExistingItems,
  getOthersWatchlist,
  handleLinkedItemsForLabelSync,
  type ItemCategorizerDeps,
  linkExistingItems,
  processAndSaveNewItems,
  type RemovalHandlerDeps,
  type WatchlistSyncDeps,
} from '@services/plex-watchlist/index.js'
import { updateAutoApprovalUserAttribution } from '../attribution/approval-attributor.js'
import { checkHealthAndQueueIfUnavailable } from '../routing/health-checker.js'
import { routeEnrichedItemsForUser } from '../routing/item-router.js'
import type { WorkflowDeps } from '../types.js'

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
  deps: WorkflowDeps,
): Promise<NewFriendHandlerResult> {
  deps.logger.info(
    { userId: newFriend.userId, username: newFriend.username },
    'New friend detected',
  )

  try {
    const { brandNewItems, linkedItems } = await syncSingleFriend(
      newFriend,
      deps,
    )

    // Route ALL items - both brand new AND linked
    // Linked items need routing because this user may have different router rules
    const allItemsToRoute = [...brandNewItems, ...linkedItems]

    if (allItemsToRoute.length > 0) {
      // Check instance health before routing - queue if unavailable
      const { health, shouldRoute } = await checkHealthAndQueueIfUnavailable(
        {
          sonarrManager: deps.sonarrManager,
          radarrManager: deps.radarrManager,
          plexServerService: deps.fastify.plexServerService,
          skipIfExistsOnPlex: deps.config.skipIfExistsOnPlex,
          deferredRoutingQueue: deps.state.deferredRoutingQueue,
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
            plexServerUnreachable: health.plexServerUnreachable,
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
        await routeEnrichedItemsForUser(newFriend.userId, allItemsToRoute, deps)

        // Post-routing tasks - update attribution and schedule status sync
        await updateAutoApprovalUserAttribution(deps)
        deps.state.scheduleDebouncedStatusSync(deps)
      }
    }

    // Only establish baseline after successful sync
    // If sync failed, next full reconciliation will handle this friend
    if (deps.state.etagPoller) {
      await deps.state.etagPoller.establishBaseline(newFriend)
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
  deps: Pick<WorkflowDeps, 'logger' | 'state'>,
): Promise<void> {
  deps.logger.info(
    { userId: newFriend.userId, username: newFriend.username },
    'New friend detected',
  )

  // Full mode: fetchWatchlists() will handle this friend's items
  // Establish baseline for future change detection
  if (deps.state.etagPoller) {
    await deps.state.etagPoller.establishBaseline(newFriend)
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
  deps: Pick<WorkflowDeps, 'logger' | 'state'>,
): void {
  deps.logger.info(
    { userId: removedFriend.userId, username: removedFriend.username },
    'Friend removed, clearing watchlist cache',
  )

  if (deps.state.etagPoller) {
    deps.state.etagPoller.invalidateUser(
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
    userMap: Map<string, UserMapEntry>
    mode: 'full' | 'etag'
  },
  deps: WorkflowDeps,
): Promise<void> {
  const { added, removed, userMap, mode } = params

  // Update UUID cache with current friends mapping
  deps.state.updatePlexUuidCache(userMap, deps.logger)

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

// ============================================================================
// Single Friend Sync
// ============================================================================

/**
 * Result of syncing a single friend's watchlist
 */
export interface FriendSyncResult {
  brandNewItems: Item[]
  linkedItems: Item[]
}

/**
 * Sync a single friend's complete watchlist to DB.
 * Returns both brand new items AND linked items (both need routing).
 *
 * IMPORTANT: Both brand new AND linked items need routing because each user
 * may have different router rules pointing to different instances.
 *
 * @param friend - The friend info with userId, username, watchlistId
 * @param deps - Service dependencies
 * @returns Object with brandNewItems and linkedItems arrays (both ready for routing)
 */
export async function syncSingleFriend(
  friend: EtagUserInfo,
  deps: WorkflowDeps,
): Promise<FriendSyncResult> {
  const categorizerDeps: ItemCategorizerDeps = { logger: deps.logger }
  const watchlistSyncDeps: WatchlistSyncDeps = {
    db: deps.db,
    logger: deps.logger,
  }
  const removalHandlerDeps: RemovalHandlerDeps = {
    db: deps.db,
    logger: deps.logger,
    plexLabelSyncService: deps.plexLabelSyncService,
  }

  const token = deps.config.plexTokens?.[0]
  if (!token || !friend.watchlistId) {
    deps.logger.warn(
      { userId: friend.userId },
      'Cannot sync friend: missing token or watchlistId',
    )
    return { brandNewItems: [], linkedItems: [] }
  }

  // Build single-friend set for getOthersWatchlist
  const friendDataForMap: Friend = {
    watchlistId: friend.watchlistId,
    username: friend.username,
    userId: friend.userId,
  }
  const friendSet = new Set([[friendDataForMap, token]] as [Friend, string][])

  // Fetch complete watchlist (paginated, gets ALL items)
  const userWatchlistMap = await getOthersWatchlist(
    deps.config,
    deps.logger,
    friendSet,
    (userId: number) => deps.db.getAllWatchlistItemsForUser(userId),
  )

  if (userWatchlistMap.size === 0) {
    deps.logger.debug(
      { userId: friend.userId },
      'New friend has empty watchlist',
    )
    return { brandNewItems: [], linkedItems: [] }
  }

  // Extract keys for DB lookup across ALL users (not just this friend)
  // This ensures cross-user item detection works correctly
  const { allKeys, userKeyMap } = extractKeysAndRelationships(
    userWatchlistMap,
    watchlistSyncDeps,
  )

  // Query DB for items that already exist (for ANY user, not just new friend)
  const existingItems = await getExistingItems(
    userKeyMap,
    allKeys,
    watchlistSyncDeps,
  )

  const { brandNewItems, existingItemsToLink } = categorizeItems(
    userWatchlistMap,
    existingItems,
    categorizerDeps,
    false, // forceRefresh = false
  )

  // Enrich and save brand new items to DB (via toItemsBatch internally)
  const processedItems = await processAndSaveNewItems(
    brandNewItems,
    false, // isSelfWatchlist = false
    false, // isMetadataRefresh = false
    deps.itemProcessorDeps,
  )

  // Link existing items - these also need routing for this user's target instances!
  await linkExistingItems(existingItemsToLink, {
    db: deps.db,
    logger: deps.logger,
    handleLinkedItemsForLabelSync: (linkItems) =>
      handleLinkedItemsForLabelSync(linkItems, removalHandlerDeps),
  })

  // Flatten Map<Friend, Set<Item>> to Item[]
  const brandNewItemsArray: Item[] = []
  for (const items of processedItems.values()) {
    brandNewItemsArray.push(...items)
  }

  // Collect linked items - these need routing too (user may have different router rules)
  // Flatten all values since this is single-friend (avoids object identity issues with Map keys)
  const linkedItemsArray: Item[] = []
  for (const items of existingItemsToLink.values()) {
    linkedItemsArray.push(...items)
  }

  deps.logger.info(
    {
      userId: friend.userId,
      username: friend.username,
      brandNewItems: brandNewItemsArray.length,
      linkedItems: linkedItemsArray.length,
    },
    'New friend watchlist synced',
  )

  // Return BOTH - caller routes all items with user-specific router rules
  return { brandNewItems: brandNewItemsArray, linkedItems: linkedItemsArray }
}
