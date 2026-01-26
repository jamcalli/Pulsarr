/**
 * Episode Checker
 *
 * Determines whether an episode aired recently based on configured threshold.
 */

import type { FastifyBaseLogger } from 'fastify'

export interface EpisodeCheckerDeps {
  logger: FastifyBaseLogger
  newEpisodeThreshold: number
}

/**
 * Determines whether an episode's air date is within the configured recent threshold.
 *
 * Returns false if airDateUtc is missing or invalid.
 * Intentionally treats future episodes (negative age) as recent to handle
 * early releases, leaks, timezone differences, and pre-releases.
 */
export function isRecentEpisode(
  airDateUtc: string,
  deps: EpisodeCheckerDeps,
): boolean {
  const { logger, newEpisodeThreshold } = deps

  try {
    if (!airDateUtc) {
      logger.warn('Missing airDateUtc in isRecentEpisode check')
      return false
    }

    const airDate = new Date(airDateUtc).getTime()
    if (Number.isNaN(airDate)) {
      logger.warn({ airDateUtc }, 'Invalid airDateUtc in isRecentEpisode check')
      return false
    }

    const now = Date.now()
    const age = now - airDate
    const isRecent = age <= newEpisodeThreshold

    logger.debug(
      {
        airDateUtc,
        airDateMs: airDate,
        nowMs: now,
        ageMs: age,
        thresholdMs: newEpisodeThreshold,
        isRecent,
      },
      'Checking if episode is recent',
    )

    return isRecent
  } catch (error) {
    logger.error({ error, airDateUtc }, 'Error checking if episode is recent')
    return false
  }
}
