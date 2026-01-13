/**
 * Batch Processor
 *
 * Processes items in parallel with controlled concurrency using p-limit.
 * Replaces the previous setTimeout polling pattern.
 */

import type { User } from '@root/types/config.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import type { ContentRouterService } from '@services/content-router.service.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { copySingleItem } from './item-copier.js'

/**
 * Dependencies for batch processing
 */
export interface BatchProcessorDeps {
  contentRouter: ContentRouterService
  logger: FastifyBaseLogger
}

/**
 * Item prepared for batch copy
 */
export interface BatchCopyItem {
  item: DatabaseWatchlistItem
  matchingContent: SonarrItem | RadarrItem
}

/**
 * Progress callback for reporting copy progress
 */
export type ProgressCallback = (completed: number, total: number) => void

/**
 * Processes a batch of items with controlled concurrency.
 * Uses p-limit for proper async/await flow without polling.
 *
 * @param deps - Service dependencies
 * @param items - Items to copy
 * @param instanceId - Target instance ID
 * @param contentType - Content type ('movie' or 'show')
 * @param userMap - Pre-fetched user map for O(1) lookups (avoids N+1 queries)
 * @param onProgress - Optional callback for progress updates
 * @param concurrency - Maximum concurrent operations (default: 5)
 * @returns Number of successfully copied items
 */
export async function processBatchCopy(
  deps: BatchProcessorDeps,
  items: BatchCopyItem[],
  instanceId: number,
  contentType: 'movie' | 'show',
  userMap: Map<number, User>,
  onProgress?: ProgressCallback,
  concurrency = 5,
): Promise<number> {
  if (items.length === 0) return 0

  const limit = pLimit(concurrency)
  let completedCount = 0

  const results = await Promise.all(
    items.map(({ item, matchingContent }) =>
      limit(async () => {
        const user = userMap.get(item.user_id)

        const success = await copySingleItem(deps, {
          item,
          matchingContent,
          instanceId,
          contentType,
          user,
        })

        completedCount++
        onProgress?.(completedCount, items.length)

        return success
      }),
    ),
  )

  return results.filter(Boolean).length
}
