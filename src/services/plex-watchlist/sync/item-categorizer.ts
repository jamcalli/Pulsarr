/**
 * Item Categorizer Module
 *
 * Handles categorizing watchlist items into new items vs existing items,
 * and mapping existing items by key for efficient lookup.
 */

import type {
  Friend,
  TokenWatchlistItem,
  Item as WatchlistItem,
} from '@root/types/plex.types.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

export interface ItemCategorizerDeps {
  logger: FastifyBaseLogger
}

/**
 * Creates a watchlist item from a template item for a different user.
 * Used when an item exists in the database but needs to be linked to another user.
 *
 * @param user - The user to create the item for
 * @param item - The source token watchlist item
 * @param templateItem - The existing item to use as a template
 * @returns A new WatchlistItem for the user
 */
export function createWatchlistItem(
  user: Friend & { userId: number },
  item: TokenWatchlistItem,
  templateItem: WatchlistItem,
): WatchlistItem {
  const now = new Date().toISOString()
  return {
    user_id: user.userId,
    title: templateItem.title,
    key: item.id,
    type: templateItem.type,
    thumb: templateItem.thumb,
    guids: parseGuids(templateItem.guids),
    genres: templateItem.genres || [],
    status: 'pending' as const,
    created_at: now,
    updated_at: now,
  }
}

/**
 * Maps existing watchlist items by their key for efficient lookup.
 * Creates a nested map structure: key -> userId -> WatchlistItem
 *
 * @param existingItems - Array of existing watchlist items
 * @param deps - Service dependencies
 * @returns Map of key to user map to watchlist item
 */
export function mapExistingItemsByKey(
  existingItems: WatchlistItem[],
  deps: ItemCategorizerDeps,
): Map<string, Map<number, WatchlistItem>> {
  deps.logger.debug(`Mapping ${existingItems.length} existing items by key`)

  const map = new Map<string, Map<number, WatchlistItem>>()
  let skippedCount = 0

  for (const item of existingItems) {
    if (!item.key || !item.user_id) {
      skippedCount++
      continue
    }

    let userMap = map.get(item.key)
    if (!userMap) {
      userMap = new Map<number, WatchlistItem>()
      map.set(item.key, userMap)
    }

    userMap.set(item.user_id, item)
  }

  deps.logger.debug(
    {
      totalItems: existingItems.length,
      skippedItems: skippedCount,
      uniqueKeys: map.size,
    },
    `Created key map with ${map.size} unique keys`,
  )

  return map
}

/**
 * Separates items into new items (not in database) and items to link (exist but for different user).
 *
 * @param items - Set of token watchlist items to process
 * @param user - The user these items belong to
 * @param existingItemsByKey - Map of existing items by key
 * @param deps - Service dependencies
 * @returns Object with newItems and itemsToLink sets
 */
export function separateNewAndExistingItems(
  items: Set<TokenWatchlistItem>,
  user: Friend & { userId: number },
  existingItemsByKey: Map<string, Map<number, WatchlistItem>>,
  deps: ItemCategorizerDeps,
): { newItems: Set<TokenWatchlistItem>; itemsToLink: Set<WatchlistItem> } {
  const newItems = new Set<TokenWatchlistItem>()
  const itemsToLink = new Set<WatchlistItem>()

  let newItemsCount = 0
  let existingItemsCount = 0
  let alreadyLinkedCount = 0
  let toBeLinkedCount = 0

  deps.logger.debug(
    `Separating ${items.size} items for user ${user.username} (ID: ${user.userId})`,
  )

  for (const item of items) {
    const lookupKey = item.key || item.id

    if (!lookupKey) {
      deps.logger.warn(
        {
          title: item.title,
        },
        `Item missing key/id for user ${user.username}`,
      )
      continue
    }

    const existingItemMap = existingItemsByKey.get(lookupKey)

    if (!existingItemMap) {
      newItems.add(item)
      newItemsCount++
    } else {
      existingItemsCount++

      if (existingItemMap.has(user.userId)) {
        alreadyLinkedCount++
      } else {
        const templateItem = existingItemMap.values().next().value

        if (templateItem?.title && templateItem?.type) {
          itemsToLink.add(createWatchlistItem(user, item, templateItem))
          toBeLinkedCount++
        } else {
          deps.logger.warn(
            {
              hasTitle: !!templateItem?.title,
              hasType: !!templateItem?.type,
            },
            `Invalid template item for ${lookupKey}`,
          )
          newItems.add(item)
          newItemsCount++
        }
      }
    }
  }

  deps.logger.debug(
    `Processed ${items.size} items for user ${user.username}: ${newItemsCount} new, ${toBeLinkedCount} to link`,
  )

  deps.logger.debug(
    {
      total: items.size,
      newItems: newItemsCount,
      existingInDb: existingItemsCount,
      alreadyLinked: alreadyLinkedCount,
      toBeLinked: toBeLinkedCount,
    },
    `Detailed separation results for ${user.username}:`,
  )

  return { newItems, itemsToLink }
}

/**
 * Categorizes watchlist items into brand new items and existing items to link.
 * When forceRefresh is enabled, treats all items as new for metadata re-fetching.
 *
 * @param userWatchlistMap - Map of users to their watchlist items
 * @param existingItems - Array of existing items in the database
 * @param deps - Service dependencies
 * @param forceRefresh - If true, treat all items as new
 * @returns Object with brandNewItems and existingItemsToLink maps
 */
export function categorizeItems(
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  existingItems: WatchlistItem[],
  deps: ItemCategorizerDeps,
  forceRefresh = false,
): {
  brandNewItems: Map<Friend, Set<TokenWatchlistItem>>
  existingItemsToLink: Map<Friend, Set<WatchlistItem>>
} {
  const brandNewItems = new Map<Friend, Set<TokenWatchlistItem>>()
  const existingItemsToLink = new Map<Friend, Set<WatchlistItem>>()

  if (forceRefresh) {
    // When force refresh is enabled, treat all items as brand new to trigger metadata re-fetching
    deps.logger.debug(
      'Force refresh enabled - treating all items as new for metadata refresh',
    )
    userWatchlistMap.forEach((items, user) => {
      brandNewItems.set(user, items)
    })
  } else {
    // Normal categorization logic
    const existingItemsByKey = mapExistingItemsByKey(existingItems, deps)

    userWatchlistMap.forEach((items, user) => {
      const { newItems, itemsToLink } = separateNewAndExistingItems(
        items,
        user as Friend & { userId: number },
        existingItemsByKey,
        deps,
      )

      if (newItems.size > 0) brandNewItems.set(user, newItems)
      if (itemsToLink.size > 0) existingItemsToLink.set(user, itemsToLink)
    })
  }

  return { brandNewItems, existingItemsToLink }
}
