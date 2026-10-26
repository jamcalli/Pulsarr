import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'

/** True for the viewer's current and next season, ignoring current_monitored_season, which only advances near a season end. */
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
