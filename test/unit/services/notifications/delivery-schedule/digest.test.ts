import type { HeldNotification } from '@root/types/notification-delivery.types.js'
import {
  buildDigest,
  formatSeason,
  toDigestEntries,
  toPlexMobileNotification,
} from '@services/notifications/delivery-schedule/digest.js'
import { describe, expect, it } from 'vitest'

let nextId = 1

function episodeRow(
  guid: string,
  title: string,
  season: number,
  episode: number,
  overrides: Partial<HeldNotification> = {},
): HeldNotification {
  const id = nextId++
  return {
    id,
    user_id: 1,
    media_type: 'show',
    guid,
    title,
    watchlist_item_key: `key-${guid}`,
    is_bulk_release: false,
    episodes: [{ seasonNumber: season, episodeNumber: episode }],
    notification: {
      type: 'show',
      title,
      username: 'user1',
      posterUrl: `https://img/${guid}.jpg`,
      tmdbUrl: `https://tmdb/${guid}`,
      episodeDetails: {
        title: `Episode ${episode}`,
        seasonNumber: season,
        episodeNumber: episode,
      },
    },
    reason: 'digest',
    deliver_after: new Date('2026-05-01T12:15:00Z'),
    claimed_at: null,
    created_at: new Date(Date.UTC(2026, 4, 1, 12, 0, id)),
    ...overrides,
  }
}

function movieRow(guid: string, title: string): HeldNotification {
  const id = nextId++
  return {
    id,
    user_id: 1,
    media_type: 'movie',
    guid,
    title,
    watchlist_item_key: `key-${guid}`,
    is_bulk_release: false,
    episodes: [],
    notification: { type: 'movie', title, username: 'user1' },
    reason: 'quiet_hours',
    deliver_after: new Date('2026-05-01T07:00:00Z'),
    claimed_at: null,
    created_at: new Date(Date.UTC(2026, 4, 1, 12, 0, id)),
  }
}

function seasonPackRow(
  guid: string,
  title: string,
  season: number,
  episodes: number[],
): HeldNotification {
  return episodeRow(guid, title, season, episodes[0], {
    is_bulk_release: true,
    episodes: episodes.map((episodeNumber) => ({
      seasonNumber: season,
      episodeNumber,
    })),
    notification: {
      type: 'show',
      title,
      username: 'user1',
      episodeDetails: { seasonNumber: season },
    },
  })
}

describe('formatSeason', () => {
  it('formats a single episode', () => {
    expect(formatSeason(2, [5], false)).toBe('S02E05')
  })

  it('collapses consecutive episodes into a range', () => {
    expect(formatSeason(2, [3, 1, 2, 4, 5, 6, 7, 8], false)).toBe('S02E01–E08')
  })

  it('lists separate runs', () => {
    expect(formatSeason(1, [1, 2, 3, 5, 9], false)).toBe('S01E01–E03, E05, E09')
  })

  it('ignores duplicate episodes', () => {
    expect(formatSeason(1, [4, 4, 5], false)).toBe('S01E04–E05')
  })

  it('shows a fragmented season as a count', () => {
    expect(formatSeason(3, [1, 3, 5, 7, 9], false)).toBe(
      'Season 3 (5 episodes)',
    )
  })

  it('shows a season pack as the season', () => {
    expect(formatSeason(2, [1, 2, 3], true)).toBe('Season 2')
  })
})

describe('buildDigest', () => {
  it('collapses episodes of one show into one title with a range', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((e) =>
      episodeRow('tvdb:1', 'Show X', 2, e),
    )
    const titles = buildDigest(rows)

    expect(titles).toHaveLength(1)
    expect(titles[0]).toMatchObject({
      mediaType: 'show',
      guid: 'tvdb:1',
      title: 'Show X',
      seasons: [2],
      detail: 'S02E01–E08',
      watchlistItemKey: 'key-tvdb:1',
    })
    expect(titles[0].rows).toHaveLength(8)
  })

  it('collapses a season pack into "Season N"', () => {
    const titles = buildDigest([
      seasonPackRow('tvdb:1', 'Show X', 2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    ])
    expect(titles[0].detail).toBe('Season 2')
  })

  it('summarizes several seasons of one show', () => {
    const titles = buildDigest([
      episodeRow('tvdb:1', 'Show X', 1, 10),
      seasonPackRow('tvdb:1', 'Show X', 2, [1, 2, 3]),
    ])
    expect(titles[0].seasons).toEqual([1, 2])
    expect(titles[0].detail).toBe('S01E10, Season 2')
  })

  it('groups several titles in order of arrival', () => {
    const titles = buildDigest([
      episodeRow('tvdb:1', 'Show X', 1, 1),
      movieRow('tmdb:9', 'Movie Y'),
      episodeRow('tvdb:2', 'Show Z', 3, 4),
      episodeRow('tvdb:1', 'Show X', 1, 2),
    ])

    expect(titles.map((t) => t.title)).toEqual(['Show X', 'Movie Y', 'Show Z'])
    expect(titles[0].detail).toBe('S01E01–E02')
    expect(titles[1].detail).toBeUndefined()
    expect(titles[2].detail).toBe('S03E04')
  })

  it('reads episodes from the notification when the row has none', () => {
    const row = episodeRow('tvdb:1', 'Show X', 4, 7, { episodes: [] })
    expect(buildDigest([row])[0].detail).toBe('S04E07')
  })

  it('maps titles to channel-neutral digest entries', () => {
    const entries = toDigestEntries(
      buildDigest([
        episodeRow('tvdb:1', 'Show X', 1, 1),
        movieRow('tmdb:9', 'Movie Y'),
      ]),
    )
    expect(entries).toEqual([
      {
        type: 'show',
        title: 'Show X',
        detail: 'S01E01',
        posterUrl: 'https://img/tvdb:1.jpg',
        tmdbUrl: 'https://tmdb/tvdb:1',
      },
      { type: 'movie', title: 'Movie Y' },
    ])
  })
})

describe('toPlexMobileNotification', () => {
  it('keeps a lone episode exactly as it was', () => {
    const row = episodeRow('tvdb:1', 'Show X', 1, 3)
    const [title] = buildDigest([row])
    expect(toPlexMobileNotification(title)).toEqual({
      notification: row.notification,
      isBulkRelease: false,
    })
  })

  it('sends several episodes of one season as a season push', () => {
    const [title] = buildDigest([
      episodeRow('tvdb:1', 'Show X', 2, 1),
      episodeRow('tvdb:1', 'Show X', 2, 2),
    ])
    const { notification, isBulkRelease } = toPlexMobileNotification(title)
    expect(isBulkRelease).toBe(true)
    expect(notification.episodeDetails).toEqual({ seasonNumber: 2 })
    expect(notification.title).toBe('Show X')
  })

  it('sends episodes across seasons as a show push', () => {
    const [title] = buildDigest([
      episodeRow('tvdb:1', 'Show X', 1, 1),
      episodeRow('tvdb:1', 'Show X', 2, 1),
    ])
    const { notification, isBulkRelease } = toPlexMobileNotification(title)
    expect(isBulkRelease).toBe(true)
    expect(notification.episodeDetails).toBeUndefined()
  })

  it('keeps a movie as a movie push', () => {
    const row = movieRow('tmdb:9', 'Movie Y')
    const [title] = buildDigest([row])
    expect(toPlexMobileNotification(title)).toEqual({
      notification: row.notification,
      isBulkRelease: false,
    })
  })
})
