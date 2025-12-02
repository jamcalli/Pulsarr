import type { Config } from '@root/types/config.types.js'
import type { Item, TokenWatchlistItem } from '@root/types/plex.types.js'
import type { ProgressService } from '@root/types/progress.types.js'
import type { FastifyBaseLogger } from 'fastify'
import { isRateLimitError } from '../api/helpers.js'
import { PlexRateLimiter } from '../api/rate-limiter.js'
import { toItemsSingle } from './single-item.js'

/**
 * Processes multiple watchlist items in batches with controlled concurrency.
 *
 * @param config - Application configuration
 * @param log - Fastify logger instance
 * @param items - Array of watchlist items to process
 * @param progressTracker - Optional progress tracking information
 * @param initialConcurrencyLimit - Starting concurrency limit (default: 3)
 * @returns Promise resolving to a Map of items and their processed results
 */
export const toItemsBatch = async (
  config: Config,
  log: FastifyBaseLogger,
  items: TokenWatchlistItem[],
  progressTracker?: {
    progress: ProgressService
    operationId: string
    type: 'self-watchlist' | 'others-watchlist' | 'rss-feed' | 'system'
    completedItems: number
    totalItems: number
    username: string
  },
  initialConcurrencyLimit = 3, // Starting with a lower limit to prevent initial rate limiting
): Promise<Map<TokenWatchlistItem, Set<Item>>> => {
  const results = new Map<TokenWatchlistItem, Set<Item>>()
  const queue = [...items]
  let processingCount = 0
  let batchCompletedCount = 0
  let currentConcurrencyLimit = initialConcurrencyLimit

  // Track successful consecutive batches for concurrency recovery
  let consecutiveSuccessCount = 0
  const RECOVERY_THRESHOLD = 5 // Number of successful items needed before attempting recovery

  // Track 404 items for consolidated reporting
  const notFoundItems: string[] = []

  // Get the global rate limiter instance
  const rateLimiter = PlexRateLimiter.getInstance()

  // Process items in batches with controlled concurrency
  while (queue.length > 0 || processingCount > 0) {
    // Check if we're rate limited using the global rate limiter
    if (rateLimiter.isLimited()) {
      const cooldownMs = rateLimiter.getRemainingCooldown()

      // Reset consecutive success counter when rate limited
      consecutiveSuccessCount = 0

      // Calculate current progress to maintain it during rate limiting
      // Use overall progress (completedItems + batchCompletedCount) divided by totalItems
      const currentProgress = progressTracker
        ? Math.min(
            95,
            Math.floor(
              ((progressTracker.completedItems + batchCompletedCount) /
                progressTracker.totalItems) *
                90,
            ) + 5,
          )
        : undefined

      // Wait for cooldown period
      await rateLimiter.waitIfLimited(
        log,
        progressTracker
          ? {
              progress: progressTracker.progress,
              operationId: progressTracker.operationId,
              type: progressTracker.type,
              message: `Rate limited by Plex API. Cooling down for ${Math.round(cooldownMs / 1000)} seconds...`,
              currentProgress,
            }
          : undefined,
      )

      // Reduce concurrency after a rate limit to avoid hitting limits again
      currentConcurrencyLimit = Math.max(
        1,
        Math.floor(currentConcurrencyLimit * 0.7),
      )
      log.info(
        `Adjusted concurrency to ${currentConcurrencyLimit} after global rate limit cooldown`,
      )
      continue
    }

    // Start processing new items up to the concurrency limit
    while (queue.length > 0 && processingCount < currentConcurrencyLimit) {
      const item = queue.shift()
      if (item) {
        processingCount++

        // Pass progress info to toItemsSingle for rate limit notifications
        const progressInfo = progressTracker
          ? {
              progress: progressTracker.progress,
              operationId: progressTracker.operationId,
              type: progressTracker.type,
            }
          : undefined

        toItemsSingle(config, log, item, 0, 3, progressInfo, notFoundItems)
          .then((itemSet) => {
            results.set(item, itemSet)
            processingCount--
            batchCompletedCount++
            consecutiveSuccessCount++ // Increment success counter

            // Recovery logic - increase concurrency based on consecutive successes
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
              // Reset counter but don't drop it to zero to maintain some "credit"
              consecutiveSuccessCount = Math.floor(RECOVERY_THRESHOLD / 2)
            }

            if (progressTracker) {
              const totalCompletedItems =
                progressTracker.completedItems + batchCompletedCount
              const overallProgress =
                Math.floor(
                  (totalCompletedItems / progressTracker.totalItems) * 90,
                ) + 5

              progressTracker.progress.emit({
                operationId: progressTracker.operationId,
                type: progressTracker.type,
                phase: 'processing',
                progress: Math.min(95, overallProgress),
                message: `Processed ${totalCompletedItems} of ${progressTracker.totalItems} items`,
              })
            }
          })
          .catch((error) => {
            // Note: We don't need to handle rate limiting here specifically anymore
            // as toItemsSingle will now handle it with the global rate limiter
            // But we'll still check just in case
            // Check if this is a rate limit exhaustion error
            if (isRateLimitError(error)) {
              log.warn(
                `Rate limit exhausted while processing item ${item.title}. Putting back in queue.`,
              )
              // Put the item back in the queue
              queue.unshift(item)
              // Let the global rate limiter handle the cooldown timing
              rateLimiter.setRateLimited(undefined, log)
              // Reset consecutive success counter
              consecutiveSuccessCount = 0
              // Reduce concurrency after a rate limit exhaustion
              currentConcurrencyLimit = Math.max(
                1,
                Math.floor(currentConcurrencyLimit * 0.7),
              )
              log.info(
                `Reduced concurrency to ${currentConcurrencyLimit} after rate limit exhaustion`,
              )
            }
            // Check for other rate limit related errors
            else if (
              error.message?.includes('429') ||
              error.message?.toLowerCase().includes('rate limit')
            ) {
              log.warn(
                `Rate limit detected while processing item ${item.title}. Putting back in queue.`,
              )
              // Put the item back in the queue
              queue.unshift(item)
              // Let the global rate limiter handle the cooldown timing
              rateLimiter.setRateLimited(undefined, log)
              // Reset consecutive success counter
              consecutiveSuccessCount = 0
              // Reduce concurrency after a rate limit
              currentConcurrencyLimit = Math.max(
                1,
                Math.floor(currentConcurrencyLimit * 0.7),
              )
              log.info(
                `Reduced concurrency to ${currentConcurrencyLimit} after rate limit detection`,
              )
            } else {
              log.error(
                { error, itemId: item.id, title: item.title, type: item.type },
                'Error processing item',
              )
              results.set(item, new Set())
              batchCompletedCount++
            }
            processingCount--
          })
      }
    }

    // Small delay between checks to avoid busy waiting
    if (
      processingCount >= currentConcurrencyLimit ||
      (processingCount > 0 && queue.length === 0)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  // Log consolidated 404 warnings if any items were not found
  if (notFoundItems.length > 0) {
    // Truncate long titles for readability
    const truncateTitle = (title: string, maxLength = 30): string => {
      if (title.length <= maxLength) return title
      return `${title.substring(0, maxLength - 3)}...`
    }

    const displayTitles = notFoundItems
      .slice(0, 10) // Show up to 10 titles
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
