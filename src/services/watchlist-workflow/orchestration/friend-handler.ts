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

export interface NewFriendHandlerResult {
  success: boolean
  itemsRouted: number
  error?: Error
}

export async function handleNewFriendEtagMode(
  newFriend: EtagUserInfo,
  deps: WorkflowDeps,
): Promise<NewFriendHandlerResult> {
  deps.logger.info(
    { userId: newFriend.userId, username: newFriend.username },
    'New friend detected',
  )
  const { signal } = deps.state

  try {
    const { brandNewItems, linkedItems } = await syncSingleFriend(
      newFriend,
      deps,
    )
    if (signal.aborted) return { success: false, itemsRouted: 0 }

    const allItemsToRoute = [...brandNewItems, ...linkedItems]

    if (allItemsToRoute.length > 0) {
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
      if (signal.aborted) return { success: false, itemsRouted: 0 }

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

        await routeEnrichedItemsForUser(newFriend.userId, allItemsToRoute, deps)
        if (signal.aborted) return { success: false, itemsRouted: 0 }

        await updateAutoApprovalUserAttribution(deps)
        deps.state.scheduleDebouncedStatusSync(deps)
      }
    }

    if (signal.aborted) return { success: false, itemsRouted: 0 }
    // Baseline only after a successful sync, otherwise the failed items are never seen again
    if (deps.state.etagPoller) {
      await deps.state.etagPoller.establishBaseline(newFriend)
    }

    return { success: true, itemsRouted: allItemsToRoute.length }
  } catch (error) {
    deps.logger.error(
      { userId: newFriend.userId, username: newFriend.username, error },
      'Failed to sync new friend - will retry on next full reconciliation',
    )
    return {
      success: false,
      itemsRouted: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

export async function handleNewFriendFullMode(
  newFriend: EtagUserInfo,
  deps: Pick<WorkflowDeps, 'logger' | 'state'>,
): Promise<void> {
  deps.logger.info(
    { userId: newFriend.userId, username: newFriend.username },
    'New friend detected',
  )

  if (deps.state.etagPoller) {
    await deps.state.etagPoller.establishBaseline(newFriend)
  }
}

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

  deps.state.updatePlexUuidCache(userMap, deps.logger)

  for (const newFriend of added) {
    if (mode === 'etag') {
      await handleNewFriendEtagMode(newFriend, deps)
    } else {
      await handleNewFriendFullMode(newFriend, deps)
    }
  }

  for (const removedFriend of removed) {
    handleRemovedFriend(removedFriend, deps)
  }
}

export interface FriendSyncResult {
  brandNewItems: Item[]
  linkedItems: Item[]
}

// Linked items need routing too: this user may have different router rules than the owner
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

  const friendDataForMap: Friend = {
    watchlistId: friend.watchlistId,
    username: friend.username,
    userId: friend.userId,
  }
  const friendSet = new Set([[friendDataForMap, token]] as [Friend, string][])

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

  const { allKeys, userKeyMap } = extractKeysAndRelationships(
    userWatchlistMap,
    watchlistSyncDeps,
  )

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

  const processedItems = await processAndSaveNewItems(
    brandNewItems,
    false, // isSelfWatchlist = false
    false, // isMetadataRefresh = false
    deps.itemProcessorDeps,
  )

  await linkExistingItems(existingItemsToLink, {
    db: deps.db,
    logger: deps.logger,
    handleLinkedItemsForLabelSync: (linkItems) =>
      handleLinkedItemsForLabelSync(linkItems, removalHandlerDeps),
  })

  const brandNewItemsArray: Item[] = []
  for (const items of processedItems.values()) {
    brandNewItemsArray.push(...items)
  }

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

  return { brandNewItems: brandNewItemsArray, linkedItems: linkedItemsArray }
}
