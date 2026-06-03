import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'

/**
 * A season is protected if it is the current or next season for the given user.
 *
 * current_monitored_season is deliberately not consulted - it is a high-water-mark
 * that only advances when expandMonitoringToNextSeason fires near end-of-season,
 * so a user on S01E03 would otherwise have S02 (their next) wrongly unmonitored
 * when another user pushes ahead in the same series.
 */
export function userNeedsSeason(
  show: RollingMonitoredShow,
  season: number,
): boolean {
  const last = show.last_watched_season ?? 0
  return season >= last && season <= last + 1
}

export function collectSeasonsEligibleForCleanup(
  startSeason: number,
  maxSeasonExclusive: number,
  activeUsers: RollingMonitoredShow[],
): number[] {
  const seasons: number[] = []
  for (let season = startSeason; season < maxSeasonExclusive; season++) {
    if (!activeUsers.some((show) => userNeedsSeason(show, season))) {
      seasons.push(season)
    }
  }
  return seasons
}
