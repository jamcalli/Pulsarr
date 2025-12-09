/**
 * Friend Handler Module
 *
 * Handles new friend detection, watchlist syncing, and baseline establishment.
 */

import type { Config } from '@root/types/config.types.js'
import type { EtagUserInfo, Friend, Item } from '@root/types/plex.types.js'
import {
  categorizeItems,
  extractKeysAndRelationships,
  getExistingItems,
  getOthersWatchlist,
  handleLinkedItemsForLabelSync,
  type ItemCategorizerDeps,
  type ItemProcessorDeps,
  linkExistingItems,
  processAndSaveNewItems,
  type RemovalHandlerDeps,
  type WatchlistSyncDeps,
} from '@services/plex-watchlist/index.js'
import type { FastifyBaseLogger } from 'fastify'
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

// ============================================================================
// Single Friend Sync
// ============================================================================

/**
 * Dependencies for syncing a single friend's watchlist
 */
export interface SyncSingleFriendDeps {
  /** Logger instance */
  logger: FastifyBaseLogger
  /** Application config (full config needed by getOthersWatchlist) */
  config: Config
  /** Database service */
  db: {
    getAllWatchlistItemsForUser: (userId: number) => Promise<Item[]>
  }
  /** Item categorizer deps */
  categorizerDeps: ItemCategorizerDeps
  /** Watchlist sync deps */
  watchlistSyncDeps: WatchlistSyncDeps
  /** Item processor deps */
  itemProcessorDeps: ItemProcessorDeps
  /** Removal handler deps */
  removalHandlerDeps: RemovalHandlerDeps
}

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
  deps: SyncSingleFriendDeps,
): Promise<FriendSyncResult> {
  const token = deps.config.plexTokens?.[0]
  if (!token || !friend.watchlistId) {
    deps.logger.warn(
      { userId: friend.userId },
      'Cannot sync friend: missing token or watchlistId',
    )
    return { brandNewItems: [], linkedItems: [] }
  }

  // Build single-friend set for getOthersWatchlist
  const friendDataForMap: Friend & { userId: number } = {
    watchlistId: friend.watchlistId,
    username: friend.username,
    userId: friend.userId,
  }
  const friendSet = new Set([[friendDataForMap, token]] as [
    Friend & { userId: number },
    string,
  ][])

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
    deps.watchlistSyncDeps,
  )

  // Query DB for items that already exist (for ANY user, not just new friend)
  const existingItems = await getExistingItems(
    userKeyMap,
    allKeys,
    deps.watchlistSyncDeps,
  )

  // Categorize: brand new (need routing) vs existing (just link)
  const { brandNewItems, existingItemsToLink } = categorizeItems(
    userWatchlistMap,
    existingItems,
    deps.categorizerDeps,
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
    db: deps.watchlistSyncDeps.db,
    logger: deps.logger,
    handleLinkedItemsForLabelSync: (linkItems) =>
      handleLinkedItemsForLabelSync(linkItems, deps.removalHandlerDeps),
  })

  // Flatten Map<Friend, Set<Item>> to Item[]
  const brandNewItemsArray: Item[] = []
  for (const items of processedItems.values()) {
    brandNewItemsArray.push(...items)
  }

  // Collect linked items - these need routing too (user may have different router rules)
  const linkedItemsArray: Item[] = []
  const linkedItemsSet = existingItemsToLink.get(friendDataForMap)
  if (linkedItemsSet) {
    linkedItemsArray.push(...linkedItemsSet)
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
