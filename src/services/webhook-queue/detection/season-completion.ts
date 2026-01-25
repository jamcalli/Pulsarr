/**
 * Season Completion Detection
 *
 * Detects when all episodes for a season have been received,
 * allowing immediate processing instead of waiting for the timeout.
 */

import type { SonarrSeries } from '@root/types/sonarr.types.js'
import type { WebhookQueue } from '@root/types/webhook.types.js'
import type { FastifyBaseLogger } from 'fastify'

export interface SeasonCompletionDeps {
  logger: FastifyBaseLogger
  queue: WebhookQueue
  getSeriesByTvdbId: (tvdbId: number) => Promise<SonarrSeries | null>
}

/**
 * Extract the expected episode count for a season from series data
 */
function getSeasonEpisodeCount(
  series: SonarrSeries,
  seasonNumber: number,
): number | null {
  const season = series.seasons?.find((s) => s.seasonNumber === seasonNumber)
  return season?.statistics?.totalEpisodeCount ?? null
}

/**
 * Fetch and cache the expected episode count for a season
 * Returns the expected count or null if unable to determine
 */
export async function fetchExpectedEpisodeCount(
  tvdbId: string,
  seasonNumber: number,
  deps: SeasonCompletionDeps,
): Promise<number | null> {
  const { logger, queue, getSeriesByTvdbId } = deps

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

  // Fetch from Sonarr
  const series = await getSeriesByTvdbId(Number(tvdbId))
  if (!series) {
    logger.debug({ tvdbId }, 'Could not fetch series data from Sonarr')
    return null
  }

  const count = getSeasonEpisodeCount(series, seasonNumber)
  if (count === null) {
    logger.debug(
      { tvdbId, seasonNumber, seriesTitle: series.title },
      'Could not determine episode count for season',
    )
    return null
  }

  // Cache the count
  seasonQueue.expectedEpisodeCount = count
  logger.debug(
    {
      tvdbId,
      seasonNumber,
      expectedEpisodeCount: count,
      seriesTitle: series.title,
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
  const expectedCount = seasonQueue.expectedEpisodeCount
  const receivedCount = seasonQueue.episodes.length

  if (expectedCount === undefined) {
    return false
  }

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
