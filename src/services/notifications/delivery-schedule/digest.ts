/**
 * Digest builder: coalesces held media-available notifications for one user
 * into one entry per title, collapsing episodes into ranges or seasons.
 */

import type {
  MediaDigestEntry,
  MediaNotification,
} from '@root/types/discord.types.js'
import type {
  HeldEpisode,
  HeldNotification,
} from '@root/types/notification-delivery.types.js'

/** A season with more separate episode runs than this is shown as a count. */
const MAX_EPISODE_RUNS = 3

export interface DigestTitle {
  mediaType: 'movie' | 'show'
  guid: string
  title: string
  watchlistItemKey: string | null
  /** Notification of the first held row; carries poster and TMDB link. */
  notification: MediaNotification
  rows: HeldNotification[]
  /** Seasons covered, ascending (shows only). */
  seasons: number[]
  /** Human summary such as "S02E01–E08" (shows only). */
  detail?: string
}

const pad = (n: number) => n.toString().padStart(2, '0')

/** Collapses sorted episode numbers into runs of consecutive numbers. */
function toRuns(episodes: number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  for (const episode of episodes) {
    const last = runs[runs.length - 1]
    if (last && episode === last[1] + 1) {
      last[1] = episode
    } else {
      runs.push([episode, episode])
    }
  }
  return runs
}

/**
 * Formats one season: "S02E05", "S02E01–E08", "S02E01–E03, E05", or
 * "Season 2" when it arrived as a season pack or is too fragmented to list.
 */
export function formatSeason(
  seasonNumber: number,
  episodes: number[],
  wholeSeason: boolean,
): string {
  const unique = [...new Set(episodes)].sort((a, b) => a - b)
  const runs = toRuns(unique)

  if (wholeSeason || unique.length === 0) {
    return `Season ${seasonNumber}`
  }
  if (runs.length > MAX_EPISODE_RUNS) {
    return `Season ${seasonNumber} (${unique.length} episodes)`
  }

  const parts = runs.map(([from, to]) =>
    from === to ? `E${pad(from)}` : `E${pad(from)}–E${pad(to)}`,
  )
  return `S${pad(seasonNumber)}${parts.join(', ')}`
}

/** Episodes a held row covers, falling back to its notification details. */
function rowEpisodes(row: HeldNotification): HeldEpisode[] {
  if (row.episodes.length > 0) return row.episodes
  const details = row.notification.episodeDetails
  if (
    details?.seasonNumber !== undefined &&
    details.episodeNumber !== undefined
  )
    return [
      {
        seasonNumber: details.seasonNumber,
        episodeNumber: details.episodeNumber,
      },
    ]
  return []
}

function rowSeasons(row: HeldNotification): number[] {
  const seasons = rowEpisodes(row).map((e) => e.seasonNumber)
  const fromDetails = row.notification.episodeDetails?.seasonNumber
  if (seasons.length === 0 && fromDetails !== undefined) return [fromDetails]
  return seasons
}

export function summarizeShowRows(rows: HeldNotification[]): {
  seasons: number[]
  detail: string | undefined
} {
  const episodesBySeason = new Map<number, number[]>()
  const wholeSeasons = new Set<number>()

  for (const row of rows) {
    for (const season of rowSeasons(row)) {
      if (!episodesBySeason.has(season)) episodesBySeason.set(season, [])
      if (row.is_bulk_release) wholeSeasons.add(season)
    }
    for (const episode of rowEpisodes(row)) {
      episodesBySeason.get(episode.seasonNumber)?.push(episode.episodeNumber)
    }
  }

  const seasons = [...episodesBySeason.keys()].sort((a, b) => a - b)
  if (seasons.length === 0) return { seasons, detail: undefined }

  const detail = seasons
    .map((season) =>
      formatSeason(
        season,
        episodesBySeason.get(season) ?? [],
        wholeSeasons.has(season),
      ),
    )
    .join(', ')

  return { seasons, detail }
}

/**
 * Groups a user's held rows by title, in order of first arrival.
 */
export function buildDigest(rows: HeldNotification[]): DigestTitle[] {
  const sorted = [...rows].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id - b.id,
  )

  const byGuid = new Map<string, HeldNotification[]>()
  for (const row of sorted) {
    const key = `${row.media_type}:${row.guid}`
    const group = byGuid.get(key)
    if (group) group.push(row)
    else byGuid.set(key, [row])
  }

  return [...byGuid.values()].map((group) => {
    const first = group[0]
    const base: DigestTitle = {
      mediaType: first.media_type,
      guid: first.guid,
      title: first.notification.title || first.title,
      watchlistItemKey:
        group.find((row) => row.watchlist_item_key)?.watchlist_item_key ?? null,
      notification: first.notification,
      rows: group,
      seasons: [],
    }
    if (first.media_type !== 'show') return base

    const { seasons, detail } = summarizeShowRows(group)
    return { ...base, seasons, detail }
  })
}

export function toDigestEntries(titles: DigestTitle[]): MediaDigestEntry[] {
  return titles.map((title) => ({
    type: title.mediaType,
    title: title.title,
    ...(title.detail ? { detail: title.detail } : {}),
    ...(title.notification.posterUrl
      ? { posterUrl: title.notification.posterUrl }
      : {}),
    ...(title.notification.tmdbUrl
      ? { tmdbUrl: title.notification.tmdbUrl }
      : {}),
  }))
}

/**
 * The single notification Plex mobile gets for a title. Plex pushes are tied
 * to one library item, so a digest becomes one push per title: the original
 * push for a lone row, the season for several episodes of one season, or the
 * show for episodes spanning seasons.
 */
export function toPlexMobileNotification(title: DigestTitle): {
  notification: MediaNotification
  isBulkRelease: boolean
} {
  if (title.rows.length === 1 || title.mediaType === 'movie') {
    return {
      notification: title.notification,
      isBulkRelease: title.rows[0].is_bulk_release,
    }
  }

  const { episodeDetails: _, ...rest } = title.notification
  return {
    notification:
      title.seasons.length === 1
        ? { ...rest, episodeDetails: { seasonNumber: title.seasons[0] } }
        : rest,
    isBulkRelease: true,
  }
}
