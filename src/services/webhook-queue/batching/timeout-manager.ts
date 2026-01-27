/**
 * Timeout Manager
 *
 * Manages queue processing timeouts for webhook batching.
 */

import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface TimeoutManagerDeps {
  logger: FastifyBaseLogger
  queue: WebhookQueue
  queueWaitTime: number
  processQueuedWebhooks: (tvdbId: string, seasonNumber: number) => Promise<void>
}

/**
 * Create a timeout for queue processing
 */
export function createQueueTimeout(
  tvdbId: string,
  seasonNumber: number,
  deps: TimeoutManagerDeps,
): NodeJS.Timeout {
  const { logger, queue, queueWaitTime, processQueuedWebhooks } = deps

  return setTimeout(() => {
    const queuedCount =
      queue[tvdbId]?.seasons?.[seasonNumber]?.episodes?.length ?? 0
    logger.info(
      {
        tvdbId,
        seasonNumber,
        waitMs: queueWaitTime,
        queuedCount,
        series: queue[tvdbId]?.title,
      },
      'Queue timeout reached, processing webhooks',
    )
    void processQueuedWebhooks(tvdbId, seasonNumber).catch((error) => {
      logger.error(
        { error, tvdbId, seasonNumber },
        'Queue timeout processing failed',
      )
    })
  }, queueWaitTime)
}

/**
 * Clear the timeout for a season
 */
export function clearSeasonTimeout(
  tvdbId: string,
  seasonNumber: number,
  queue: WebhookQueue,
): void {
  const seasonQueue = queue[tvdbId]?.seasons?.[seasonNumber]
  if (seasonQueue?.timeoutId) {
    clearTimeout(seasonQueue.timeoutId)
    seasonQueue.timeoutId = undefined
  }
}

/**
 * Reset (extend) the timeout for a season
 */
export function resetSeasonTimeout(
  tvdbId: string,
  seasonNumber: number,
  deps: TimeoutManagerDeps,
): void {
  clearSeasonTimeout(tvdbId, seasonNumber, deps.queue)
  if (deps.queue[tvdbId]?.seasons?.[seasonNumber]) {
    deps.queue[tvdbId].seasons[seasonNumber].timeoutId = createQueueTimeout(
      tvdbId,
      seasonNumber,
      deps,
    )
  }
}
