import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { WatchlistSyncProgress } from '../progress/sync-progress.js'
import { toItemsBatch } from './batch-processor.js'

export const processWatchlistItems = async (
  config: Config,
  log: FastifyBaseLogger,
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  progress?: WatchlistSyncProgress,
): Promise<Map<Friend, Set<Item>>> => {
  const results = new Map<Friend, Set<Item>>()

  const totalItems = Array.from(userWatchlistMap.values()).reduce(
    (sum, items) => sum + items.size,
    0,
  )
  progress?.processingItems(0, totalItems)

  let completedItems = 0

  for (const [user, watchlistItems] of userWatchlistMap.entries()) {
    log.debug(
      `Processing ${watchlistItems.size} watchlist items for user ${user.username}`,
    )

    const itemsArray = Array.from(watchlistItems)
    const processedItemsMap = await toItemsBatch(
      config,
      log,
      itemsArray,
      progress ? { reporter: progress, completedItems, totalItems } : undefined,
      2,
    )

    const userItems = new Set<Item>()
    for (const itemSet of processedItemsMap.values()) {
      for (const item of itemSet) {
        userItems.add(item)
      }
    }

    if (userItems.size > 0) {
      results.set(user, userItems)
    }

    completedItems += watchlistItems.size
  }

  return results
}
