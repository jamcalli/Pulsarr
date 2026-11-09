import type { Config } from '@root/types/config.types.js'
import type { Item, TokenWatchlistItem } from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { isRateLimitError } from '../api/helpers.js'
import { PlexRateLimiter } from '../api/rate-limiter.js'
import type { WatchlistSyncProgress } from '../progress/sync-progress.js'
import { toItemsSingle } from './single-item.js'

/** progress.completedItems counts items finished before this batch, so the reported count stays overall across batches. */
export const toItemsBatch = async (
  config: Config,
  log: FastifyBaseLogger,
  items: TokenWatchlistItem[],
  progress?: {
    reporter: WatchlistSyncProgress
    completedItems: number
    totalItems: number
  },
  initialConcurrencyLimit = 3,
): Promise<Map<TokenWatchlistItem, Set<Item>>> => {
  const results = new Map<TokenWatchlistItem, Set<Item>>()
  const queue = [...items]
  let processingCount = 0
  let batchCompletedCount = 0
  let currentConcurrencyLimit = initialConcurrencyLimit

  let consecutiveSuccessCount = 0
  const RECOVERY_THRESHOLD = 5

  const notFoundItems: string[] = []

  const rateLimiter = PlexRateLimiter.getInstance()

  const reportItemDone = () =>
    progress?.reporter.processingItems(
      progress.completedItems + batchCompletedCount,
      progress.totalItems,
    )

  while (queue.length > 0 || processingCount > 0) {
    if (rateLimiter.isLimited()) {
      consecutiveSuccessCount = 0

      await rateLimiter.waitIfLimited(log, progress?.reporter.rateLimited)

      currentConcurrencyLimit = Math.max(
        1,
        Math.floor(currentConcurrencyLimit * 0.7),
      )
      log.debug(
        `Adjusted concurrency to ${currentConcurrencyLimit} after global rate limit cooldown`,
      )
      continue
    }

    while (queue.length > 0 && processingCount < currentConcurrencyLimit) {
      const item = queue.shift()
      if (item) {
        processingCount++

        toItemsSingle(
          config,
          log,
          item,
          0,
          3,
          progress?.reporter,
          notFoundItems,
        )
          .then((itemSet) => {
            results.set(item, itemSet)
            processingCount--
            batchCompletedCount++
            consecutiveSuccessCount++

            if (
              currentConcurrencyLimit < initialConcurrencyLimit &&
              consecutiveSuccessCount >= RECOVERY_THRESHOLD
            ) {
              currentConcurrencyLimit = Math.min(
                currentConcurrencyLimit + 1,
                initialConcurrencyLimit,
              )
              log.debug(
                `Concurrency recovery: increasing to ${currentConcurrencyLimit} after ${consecutiveSuccessCount} consecutive successes`,
              )
              consecutiveSuccessCount = Math.floor(RECOVERY_THRESHOLD / 2)
            }

            reportItemDone()
          })
          .catch((error) => {
            if (isRateLimitError(error)) {
              log.warn(
                `Rate limit exhausted while processing item ${item.title}. Putting back in queue.`,
              )
              queue.unshift(item)
              rateLimiter.setRateLimited(undefined, log)
              consecutiveSuccessCount = 0
              currentConcurrencyLimit = Math.max(
                1,
                Math.floor(currentConcurrencyLimit * 0.7),
              )
              log.debug(
                `Reduced concurrency to ${currentConcurrencyLimit} after rate limit exhaustion`,
              )
            } else if (
              error.message?.includes('429') ||
              error.message?.toLowerCase().includes('rate limit')
            ) {
              log.warn(
                `Rate limit detected while processing item ${item.title}. Putting back in queue.`,
              )
              queue.unshift(item)
              rateLimiter.setRateLimited(undefined, log)
              consecutiveSuccessCount = 0
              currentConcurrencyLimit = Math.max(
                1,
                Math.floor(currentConcurrencyLimit * 0.7),
              )
              log.debug(
                `Reduced concurrency to ${currentConcurrencyLimit} after rate limit detection`,
              )
            } else {
              log.error(
                { error, itemId: item.id, title: item.title, type: item.type },
                'Error processing item',
              )
              results.set(item, new Set())
              batchCompletedCount++
              reportItemDone()
            }
            processingCount--
          })
      }
    }

    if (
      processingCount >= currentConcurrencyLimit ||
      (processingCount > 0 && queue.length === 0)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  if (notFoundItems.length > 0) {
    const truncateTitle = (title: string, maxLength = 30): string => {
      if (title.length <= maxLength) return title
      return `${title.substring(0, maxLength - 3)}...`
    }

    const displayTitles = notFoundItems
      .slice(0, 10)
      .map((title) => `"${truncateTitle(title)}"`)
      .join(', ')

    const additionalCount =
      notFoundItems.length > 10
        ? ` (and ${notFoundItems.length - 10} more)`
        : ''

    log.warn(
      `${notFoundItems.length} items not found in Plex database (HTTP 404) - skipping retries: ${displayTitles}${additionalCount}`,
    )
  }

  return results
}
