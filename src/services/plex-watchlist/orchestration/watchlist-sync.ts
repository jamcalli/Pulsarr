import type {
  Friend,
  TokenWatchlistItem,
  WatchlistGroup,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

export interface WatchlistSyncDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

export interface KeysAndRelationships {
  allKeys: Set<string>
  userKeyMap: Map<string, Set<string>>
}

export function extractKeysAndRelationships(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  deps: WatchlistSyncDeps,
): KeysAndRelationships {
  const { logger } = deps
  const allKeys = new Set<string>()
  const userKeyMap = new Map<string, Set<string>>()

  for (const [user, items] of userWatchlistMap) {
    const userId = String(user.userId)
    const userKeys = new Set<string>()

    for (const item of items) {
      if (item.id) {
        allKeys.add(item.id)
        userKeys.add(item.id)
      } else {
        logger.warn(
          `Encountered item with null/undefined id for user ${userId}`,
        )
      }
    }

    if (userKeys.size > 0) {
      userKeyMap.set(userId, userKeys)
    }
  }

  logger.debug(
    { userIds: Array.from(userKeyMap.keys()) },
    `Collected ${userKeyMap.size} users and ${allKeys.size} unique keys`,
  )
  return { allKeys, userKeyMap }
}

export async function getExistingItems(
  userKeyMap: Map<string, Set<string>>,
  allKeys: Set<string>,
  deps: WatchlistSyncDeps,
): Promise<WatchlistItem[]> {
  const { db, logger } = deps
  const keys = Array.from(allKeys)
  const userIds = Array.from(userKeyMap.keys())
    .map(Number)
    .filter((id) => !Number.isNaN(id))

  logger.debug(
    {
      userIds,
      keySample: keys.slice(0, 5),
    },
    `Looking up existing items with ${userIds.length} users and ${keys.length} unique keys`,
  )

  const allItemsByKey = await db.getWatchlistItemsByKeys(keys)

  logger.debug(
    `Found ${allItemsByKey.length} existing items by keys in database`,
  )

  const userSpecificItems = await db.getBulkWatchlistItems(userIds, keys)

  logger.debug(
    `Found ${userSpecificItems.length} user-specific items in database`,
  )

  const combinedItems = [...allItemsByKey, ...userSpecificItems]
  const uniqueItems = new Map<string, WatchlistItem>()

  for (const item of combinedItems) {
    if (!item.key || !item.user_id) continue

    const uniqueId = `${item.key}:${item.user_id}`
    if (!uniqueItems.has(uniqueId)) {
      uniqueItems.set(uniqueId, item)
    }
  }

  const existingItems = Array.from(uniqueItems.values())

  logger.debug(
    `Found ${existingItems.length} unique existing items for processing`,
  )

  return existingItems
}

export function formatWatchlistItem(item: WatchlistItem): {
  title: string
  plexKey: string
  type: string
  thumb: string
  guids: string[]
  genres: string[]
  status: 'pending'
} {
  return {
    title: item.title,
    plexKey: item.key || '',
    type: item.type,
    thumb: item.thumb || '',
    guids: parseGuids(item.guids),
    genres: parseGenres(item.genres),
    status: 'pending' as const,
  }
}

export function formatExistingItems(
  existingItems: WatchlistItem[],
  user: Friend & { userId: number },
): ReturnType<typeof formatWatchlistItem>[] {
  return existingItems
    .filter((item) => item.user_id === user.userId)
    .map((item) => formatWatchlistItem(item))
}

export function formatLinkedItems(
  existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  user: Friend & { userId: number },
): ReturnType<typeof formatWatchlistItem>[] {
  const items = existingItemsToLink.get(user)
  return items ? Array.from(items).map(formatWatchlistItem) : []
}

export function formatProcessedItems(
  processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  user: Friend & { userId: number },
): ReturnType<typeof formatWatchlistItem>[] {
  return processedItems.has(user)
    ? Array.from(processedItems.get(user) as Set<WatchlistItem>).map((item) =>
        formatWatchlistItem(item),
      )
    : []
}

export function calculateTotal(
  existingItems: WatchlistItem[],
  existingItemsToLink: Map<Friend, Set<WatchlistItem>>,
  processedItems: Map<Friend, Set<WatchlistItem>>,
): number {
  const linkItemsCount = Array.from(existingItemsToLink.values()).reduce(
    (acc, items) => acc + items.size,
    0,
  )
  const processedItemsCount = Array.from(processedItems.values()).reduce(
    (acc, items) => acc + items.size,
    0,
  )
  return existingItems.length + linkItemsCount + processedItemsCount
}

export function buildUserWatchlists(
  userWatchlistMap: Map<Friend & { userId: number }, Set<TokenWatchlistItem>>,
  existingItems: WatchlistItem[],
  existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
): WatchlistGroup[] {
  return Array.from(userWatchlistMap.keys()).map((user) => ({
    user: {
      watchlistId: user.watchlistId,
      username: user.username,
      userId: user.userId,
    },
    watchlist: [
      ...formatExistingItems(existingItems, user),
      ...formatLinkedItems(existingItemsToLink, user),
      ...formatProcessedItems(processedItems, user),
    ],
  }))
}

export function buildResponse(
  userWatchlistMap: Map<Friend & { userId: number }, Set<TokenWatchlistItem>>,
  existingItems: WatchlistItem[],
  existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  processedItems: Map<Friend & { userId: number }, Set<WatchlistItem>>,
): { total: number; users: WatchlistGroup[] } {
  return {
    total: calculateTotal(existingItems, existingItemsToLink, processedItems),
    users: buildUserWatchlists(
      userWatchlistMap,
      existingItems,
      existingItemsToLink,
      processedItems,
    ),
  }
}
