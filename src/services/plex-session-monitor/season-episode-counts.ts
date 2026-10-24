import type { SeasonEpisodeCounts } from '@root/types/plex-session.types.js'
import type { SonarrEpisode, SonarrSeries } from '@root/types/sonarr.types.js'

export function countsFromSeasonStatistics(
  seasons: SonarrSeries['seasons'],
): SeasonEpisodeCounts {
  const counts: SeasonEpisodeCounts = {}
  for (const season of seasons ?? []) {
    const total = season.statistics?.totalEpisodeCount
    if (season.seasonNumber > 0 && total) {
      counts[season.seasonNumber] = total
    }
  }
  return counts
}

export function countsFromEpisodes(
  episodes: Pick<SonarrEpisode, 'seasonNumber'>[],
): SeasonEpisodeCounts {
  const counts: SeasonEpisodeCounts = {}
  for (const { seasonNumber } of episodes) {
    if (seasonNumber > 0) {
      counts[seasonNumber] = (counts[seasonNumber] ?? 0) + 1
    }
  }
  return counts
}

export function sameSeasonEpisodeCounts(
  stored: SeasonEpisodeCounts | null | undefined,
  counts: SeasonEpisodeCounts,
): boolean {
  if (!stored) return false
  const keys = Object.keys(counts)
  return (
    keys.length === Object.keys(stored).length &&
    keys.every((season) => stored[season] === counts[season])
  )
}
