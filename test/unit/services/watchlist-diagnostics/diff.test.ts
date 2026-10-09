import {
  canonicalizeGuids,
  diffWatchlist,
  extractContentIds,
  guidsOverlap,
  type LiveWatchlistItem,
  normalizeWatchlistKey,
  type StoredWatchlistItem,
} from '@services/watchlist-diagnostics/diff.js'
import { describe, expect, it } from 'vitest'

function stored(
  overrides: Partial<StoredWatchlistItem> & { key: string },
): StoredWatchlistItem {
  return {
    id: 1,
    title: 'Stored',
    type: 'movie',
    status: 'pending',
    guids: [],
    added: null,
    lastNotifiedAt: null,
    ...overrides,
  }
}

function live(key: string, title = 'Live', type = 'movie'): LiveWatchlistItem {
  return { key, title, type }
}

describe('watchlist-diagnostics/diff', () => {
  describe('normalizeWatchlistKey', () => {
    it('strips the discover API path wrapper', () => {
      expect(normalizeWatchlistKey('/library/metadata/abc123')).toBe('abc123')
      expect(normalizeWatchlistKey('/library/metadata/abc123/children')).toBe(
        'abc123',
      )
    })

    it('leaves bare GraphQL ids alone apart from whitespace', () => {
      expect(normalizeWatchlistKey('  abc123 ')).toBe('abc123')
    })
  })

  describe('diffWatchlist', () => {
    it('splits items into matched, Plex-only and Pulsarr-only', () => {
      const result = diffWatchlist(
        [live('a'), live('b')],
        [stored({ id: 1, key: 'b' }), stored({ id: 2, key: 'c' })],
      )

      expect(result.matched.map((m) => m.stored.id)).toEqual([1])
      expect(result.plexOnly.map((i) => i.key)).toEqual(['a'])
      expect(result.pulsarrOnly.map((i) => i.id)).toEqual([2])
    })

    it('matches a discover-style path against a bare stored key', () => {
      const result = diffWatchlist(
        [live('/library/metadata/abc/children')],
        [stored({ key: 'abc' })],
      )

      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].live.key).toBe('abc')
      expect(result.plexOnly).toHaveLength(0)
      expect(result.pulsarrOnly).toHaveLength(0)
    })

    it('reports everything as Plex-only when Pulsarr has nothing stored', () => {
      const result = diffWatchlist([live('a'), live('b')], [])
      expect(result.plexOnly).toHaveLength(2)
      expect(result.matched).toHaveLength(0)
      expect(result.pulsarrOnly).toHaveLength(0)
    })

    it('reports everything as Pulsarr-only when the live watchlist is empty', () => {
      const result = diffWatchlist(
        [],
        [stored({ id: 1, key: 'a' }), stored({ id: 2, key: 'b' })],
      )
      expect(result.pulsarrOnly.map((i) => i.id)).toEqual([1, 2])
    })

    it('collapses duplicate live keys and ignores empty keys', () => {
      const result = diffWatchlist([live('a'), live('a'), live('  ')], [])
      expect(result.plexOnly).toEqual([live('a')])
    })

    it('keeps the first stored row when a key is stored twice', () => {
      const result = diffWatchlist(
        [live('a')],
        [stored({ id: 1, key: 'a' }), stored({ id: 2, key: 'a' })],
      )
      expect(result.matched).toHaveLength(1)
      expect(result.matched[0].stored.id).toBe(1)
      expect(result.pulsarrOnly).toHaveLength(0)
    })
  })

  describe('canonicalizeGuids', () => {
    it('normalizes provider://id to provider:id and lowercases', () => {
      expect(canonicalizeGuids(['TMDB://603', 'Plex://movie/abc'])).toEqual([
        'tmdb:603',
        'plex:movie/abc',
      ])
    })

    it('strips zero padding from TMDB and TVDB ids', () => {
      expect(canonicalizeGuids(['tmdb:000603', 'tvdb:0081189'])).toEqual([
        'tmdb:603',
        'tvdb:81189',
      ])
    })

    it('adds the tt prefix to bare IMDb ids and keeps their padding', () => {
      expect(canonicalizeGuids(['imdb:0133093'])).toEqual(['imdb:tt0133093'])
      expect(canonicalizeGuids(['imdb://TT0133093'])).toEqual([
        'imdb:tt0133093',
      ])
    })

    it('drops malformed and zero ids the router would ignore', () => {
      expect(
        canonicalizeGuids([
          'tmdb:0',
          'tvdb:abc',
          'imdb:tt0000000',
          'imdb:nope',
          'garbage',
          'tmdb:',
        ]),
      ).toEqual([])
    })

    it('accepts a JSON string and de-duplicates equivalent ids', () => {
      expect(
        canonicalizeGuids(JSON.stringify(['tmdb:603', 'tmdb://0603'])),
      ).toEqual(['tmdb:603'])
    })

    it('returns an empty list for missing guids', () => {
      expect(canonicalizeGuids(undefined)).toEqual([])
      expect(canonicalizeGuids([])).toEqual([])
    })
  })

  describe('extractContentIds', () => {
    it('extracts numeric TMDB/TVDB ids and the IMDb id', () => {
      expect(
        extractContentIds(
          canonicalizeGuids(['tmdb:603', 'tvdb:81189', 'imdb:tt0133093']),
        ),
      ).toEqual({ tmdb: 603, tvdb: 81189, imdb: 'tt0133093' })
    })

    it('returns nulls for an item with no ids', () => {
      expect(extractContentIds([])).toEqual({
        tmdb: null,
        tvdb: null,
        imdb: null,
      })
    })
  })

  describe('guidsOverlap', () => {
    it('matches across formatting differences', () => {
      expect(guidsOverlap(['tmdb://0603'], ['TMDB:603'])).toBe(true)
      expect(guidsOverlap(['imdb:0133093'], ['imdb:tt0133093'])).toBe(true)
    })

    it('does not match different ids or different providers', () => {
      expect(guidsOverlap(['tmdb:603'], ['tmdb:604'])).toBe(false)
      expect(guidsOverlap(['tmdb:603'], ['tvdb:603'])).toBe(false)
    })

    it('never matches on dropped zero ids', () => {
      expect(guidsOverlap(['tmdb:0'], ['tmdb:0'])).toBe(false)
    })
  })
})
