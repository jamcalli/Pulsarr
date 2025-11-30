/**
 * Watchlist Sync Orchestration
 *
 * Helper functions for processing and formatting watchlist data.
 * Extracted from PlexWatchlistService to support thin orchestrator pattern.
 */

import type {
  Friend,
  TokenWatchlistItem,
  WatchlistGroup,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import { parseGenres, parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Dependencies for watchlist sync operations
 */
export interface WatchlistSyncDeps {
  db: FastifyInstance['db']
  logger: FastifyBaseLogger
}

/**
 * Result of extracting keys and relationships from a user watchlist map
 */
export interface KeysAndRelationships {
  allKeys: Set<string>
  userKeyMap: Map<string, Set<string>>
}

/**
 * Extracts unique keys and user-key relationships from a watchlist map.
 *
 * @param userWatchlistMap - Map of users to their watchlist items
 * @param deps - Dependencies for logging
 * @returns Object containing all unique keys and user-to-keys mapping
 */
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

/**
 * Retrieves existing watchlist items from the database.
 *
 * @param userKeyMap - Map of user IDs to their watchlist keys
 * @param allKeys - Set of all unique keys to look up
 * @param deps - Dependencies for database access and logging
 * @returns Array of existing watchlist items
 */
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

/**
 * Formats a single watchlist item for API response.
 *
 * @param item - The watchlist item to format
 * @returns Formatted item object
 */
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

/**
 * Formats existing items for a specific user.
 *
 * @param existingItems - All existing items from database
 * @param user - The user to filter items for
 * @returns Array of formatted items for the user
 */
export function formatExistingItems(
  existingItems: WatchlistItem[],
  user: Friend & { userId: number },
): ReturnType<typeof formatWatchlistItem>[] {
  return existingItems
    .filter((item) => item.user_id === user.userId)
    .map((item) => formatWatchlistItem(item))
}

/**
 * Formats linked items for a specific user.
 *
 * @param existingItemsToLink - Map of users to items that need linking
 * @param user - The user to get linked items for
 * @returns Array of formatted linked items
 */
export function formatLinkedItems(
  existingItemsToLink: Map<Friend & { userId: number }, Set<WatchlistItem>>,
  user: Friend & { userId: number },
): ReturnType<typeof formatWatchlistItem>[] {
  return existingItemsToLink.has(user)
    ? Array.from(existingItemsToLink.get(user) as Set<WatchlistItem>).map(
        (item) => formatWatchlistItem(item),
      )
    : []
}

/**
 * Formats processed items for a specific user.
 *
 * @param processedItems - Map of users to newly processed items
 * @param user - The user to get processed items for
 * @returns Array of formatted processed items
 */
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

/**
 * Calculates the total number of items across all categories.
 *
 * @param existingItems - Items already in database
 * @param existingItemsToLink - Items being linked to users
 * @param processedItems - Newly processed items
 * @returns Total count of all items
 */
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

/**
 * Builds the user watchlists array for API response.
 *
 * @param userWatchlistMap - Map of users to their token watchlist items
 * @param existingItems - Items already in database
 * @param existingItemsToLink - Items being linked to users
 * @param processedItems - Newly processed items
 * @returns Array of user watchlist groups
 */
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

/**
 * Builds the complete API response for watchlist endpoints.
 *
 * @param userWatchlistMap - Map of users to their token watchlist items
 * @param existingItems - Items already in database
 * @param existingItemsToLink - Items being linked to users
 * @param processedItems - Newly processed items
 * @returns Complete response object with total and users array
 */
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
