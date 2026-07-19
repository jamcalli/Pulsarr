/**
 * Season Completion Detection
 *
 * Detects when all episodes for a season have been received,
 * allowing immediate processing instead of waiting for the timeout.
 */

import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface SeasonCompletionDeps {
  logger: FastifyBaseLogger
  queue: WebhookQueue
  getSeasonEpisodeCount: (
    instanceId: number,
    seriesId: number,
    seasonNumber: number,
  ) => Promise<number | null>
}

/**
 * Fetch and cache the expected episode count for a season.
 * Uses the /episode endpoint with the Sonarr series ID from the webhook payload,
 * which is a direct indexed query (milliseconds) instead of the /series endpoint
 * that computes statistics for all series (130+ seconds on large instances).
 */
export async function fetchExpectedEpisodeCount(
  tvdbId: string,
  seasonNumber: number,
  deps: SeasonCompletionDeps,
): Promise<number | null> {
  const { logger, queue, getSeasonEpisodeCount } = deps

  const showQueue = queue[tvdbId]
  if (!showQueue?.seasons[seasonNumber]) {
    logger.debug({ tvdbId, seasonNumber }, 'No queue exists for season')
    return null
  }

  const seasonQueue = showQueue.seasons[seasonNumber]

  // Return cached value if available
  if (seasonQueue.expectedEpisodeCount !== undefined) {
    return seasonQueue.expectedEpisodeCount
  }

  const { sonarrSeriesId, instanceId } = seasonQueue

  if (sonarrSeriesId === undefined || instanceId == null) {
    logger.debug(
      { tvdbId, seasonNumber, sonarrSeriesId, instanceId },
      'Missing Sonarr series ID or instance ID for episode count lookup',
    )
    return null
  }

  const count = await getSeasonEpisodeCount(
    instanceId,
    sonarrSeriesId,
    seasonNumber,
  )
  if (count === null) {
    logger.debug(
      { tvdbId, seasonNumber, sonarrSeriesId, instanceId },
      'Failed to fetch episode count from Sonarr',
    )
    return null
  }

  // Cache the raw count; the pilot adjustment happens at completion-check
  // time because bulk imports can deliver E01 into the queue in any chunk.
  seasonQueue.expectedEpisodeCount = count
  logger.debug(
    {
      tvdbId,
      seasonNumber,
      expectedEpisodeCount: count,
      sonarrSeriesId,
    },
    'Cached expected episode count for season',
  )
  return count
}

/**
 * Check if all expected episodes for a season have been received
 */
export function isSeasonComplete(
  tvdbId: string,
  seasonNumber: number,
  deps: SeasonCompletionDeps,
): boolean {
  const { logger, queue } = deps

  const showQueue = queue[tvdbId]
  if (!showQueue?.seasons[seasonNumber]) {
    return false
  }

  const seasonQueue = showQueue.seasons[seasonNumber]
  const receivedCount = seasonQueue.episodes.length

  if (seasonQueue.expectedEpisodeCount === undefined) {
    return false
  }

  // For pilot-based rolling shows, E01 was notified immediately and skipped
  // the queue - unless a bulk import delivered it here anyway. Only subtract
  // the pilot when it is actually absent from the queue.
  const pilotNotifiedSeparately =
    seasonQueue.isPilotRolling === true &&
    !seasonQueue.episodes.some((ep) => ep.episodeNumber === 1)
  const expectedCount = pilotNotifiedSeparately
    ? Math.max(1, seasonQueue.expectedEpisodeCount - 1)
    : seasonQueue.expectedEpisodeCount

  const isComplete = receivedCount >= expectedCount

  if (isComplete) {
    logger.info(
      {
        tvdbId,
        seasonNumber,
        receivedCount,
        expectedCount,
        seriesTitle: showQueue.title,
      },
      'Season complete - all episodes received',
    )
  } else {
    logger.debug(
      {
        tvdbId,
        seasonNumber,
        receivedCount,
        expectedCount,
      },
      'Season not yet complete',
    )
  }

  return isComplete
}
