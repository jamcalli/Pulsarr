import type { FastifyInstance } from 'fastify'

/**
 * Determines whether an episode's air date is within the configured recent threshold.
 *
 * Returns false if {@link airDateUtc} is missing or invalid.
 *
 * @param airDateUtc - The UTC air date of the episode as an ISO string.
 * @returns True if the episode aired within the recent threshold; otherwise, false.
 */
export function isRecentEpisode(
  airDateUtc: string,
  fastify: FastifyInstance,
): boolean {
  try {
    if (!airDateUtc) {
      fastify.log.warn('Missing airDateUtc in isRecentEpisode check')
      return false
    }

    const airDate = new Date(airDateUtc).getTime()
    const now = Date.now()
    const threshold = fastify.config.newEpisodeThreshold
    const age = now - airDate
    // Intentionally treats future episodes (negative age) as recent
    // This handles early releases, leaks, timezone differences, and pre-releases
    const isRecent = age <= threshold

    fastify.log.debug(
      {
        airDateUtc,
        airDateMs: airDate,
        nowMs: now,
        ageMs: age,
        thresholdMs: threshold,
        isRecent,
      },
      'Checking if episode is recent',
    )

    return isRecent
  } catch (error) {
    fastify.log.error(
      { error, airDateUtc },
      'Error checking if episode is recent',
    )
    return false
  }
}
