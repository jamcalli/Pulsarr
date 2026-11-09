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

export function createWatchlistItem(
  user: Friend,
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
    ratings: templateItem.ratings,
    status: 'pending' as const,
    created_at: now,
    updated_at: now,
  }
}

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

export function separateNewAndExistingItems(
  items: Set<TokenWatchlistItem>,
  user: Friend,
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
    deps.logger.debug(
      'Force refresh enabled - treating all items as new for metadata refresh',
    )
    userWatchlistMap.forEach((items, user) => {
      brandNewItems.set(user, items)
    })
  } else {
    const existingItemsByKey = mapExistingItemsByKey(existingItems, deps)

    userWatchlistMap.forEach((items, user) => {
      const { newItems, itemsToLink } = separateNewAndExistingItems(
        items,
        user,
        existingItemsByKey,
        deps,
      )

      if (newItems.size > 0) brandNewItems.set(user, newItems)
      if (itemsToLink.size > 0) existingItemsToLink.set(user, itemsToLink)
    })
  }

  return { brandNewItems, existingItemsToLink }
}
