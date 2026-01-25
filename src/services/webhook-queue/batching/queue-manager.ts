/**
 * Queue Manager
 *
 * Manages the in-memory webhook queue state.
 */

import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface QueueManagerDeps {
  logger: FastifyBaseLogger
}

/**
 * Determines whether a specific episode is already present in the webhook queue.
 */
export function isEpisodeAlreadyQueued(
  tvdbId: string,
  seasonNumber: number,
  episodeNumber: number,
  queue: WebhookQueue,
): boolean {
  if (!queue[tvdbId]?.seasons[seasonNumber]?.episodes) {
    return false
  }

  return queue[tvdbId].seasons[seasonNumber].episodes.some(
    (episode) =>
      episode.seasonNumber === seasonNumber &&
      episode.episodeNumber === episodeNumber,
  )
}

/**
 * Clear all pending timeouts in the queue
 */
export function clearAllTimeouts(
  queue: WebhookQueue,
  deps: QueueManagerDeps,
): void {
  const { logger } = deps

  for (const [tvdbId, show] of Object.entries(queue)) {
    for (const [seasonNumber, season] of Object.entries(show.seasons)) {
      if (season.timeoutId) {
        clearTimeout(season.timeoutId)
        logger.debug({ tvdbId, seasonNumber }, 'Cleared queue timeout')
      }
    }
  }
}
