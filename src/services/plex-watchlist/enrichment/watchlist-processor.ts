import type { Config } from '@root/types/config.types.js'
import type {
  Friend,
  Item,
  TokenWatchlistItem,
} from '@root/types/plex.types.js'
import type { ProgressService } from '@root/types/progress.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { toItemsBatch } from './batch-processor.js'

/**
 * Processes all watchlist items for multiple users, converting TokenWatchlistItems to Items.
 *
 * @param config - Application configuration
 * @param log - Fastify logger instance
 * @param userWatchlistMap - Map of Friends to their TokenWatchlistItems
 * @param progressInfo - Optional progress tracking information
 * @returns Promise resolving to a Map of Friends to their processed Items
 */
export const processWatchlistItems = async (
  config: Config,
  log: FastifyBaseLogger,
  userWatchlistMap: Map<Friend, Set<TokenWatchlistItem>>,
  progressInfo?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
  },
): Promise<Map<Friend, Set<Item>>> => {
  const results = new Map<Friend, Set<Item>>()

  // Calculate total items for progress tracking
  const totalItems = Array.from(userWatchlistMap.values()).reduce(
    (sum, items) => sum + items.size,
    0,
  )

  if (progressInfo) {
    progressInfo.progress.emit({
      operationId: progressInfo.operationId,
      type: progressInfo.type,
      phase: 'setup',
      progress: 5,
      message: `Starting to process ${totalItems} items`,
    })
  }

  // Track completed items across all users
  let completedItems = 0

  // Process each user's watchlist
  for (const [user, watchlistItems] of userWatchlistMap.entries()) {
    log.debug(
      `Processing ${watchlistItems.size} watchlist items for user ${user.username}`,
    )

    // Process items in parallel batches
    const itemsArray = Array.from(watchlistItems)
    const processedItemsMap = await toItemsBatch(
      config,
      log,
      itemsArray,
      progressInfo
        ? {
            progress: progressInfo.progress,
            operationId: progressInfo.operationId,
            type: progressInfo.type,
            completedItems,
            totalItems,
            username: user.username,
          }
        : undefined,
      2, // Concurrency limit
    )

    // Combine all items for this user
    const userItems = new Set<Item>()
    for (const itemSet of processedItemsMap.values()) {
      for (const item of itemSet) {
        userItems.add(item)
      }
    }

    if (userItems.size > 0) {
      results.set(user, userItems)
    }

    // Update completed items count
    completedItems += watchlistItems.size
  }

  if (progressInfo) {
    progressInfo.progress.emit({
      operationId: progressInfo.operationId,
      type: progressInfo.type,
      phase: 'complete',
      progress: 95,
      message: `Processed all ${totalItems} items - finalizing`,
    })
  }

  return results
}
