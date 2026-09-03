import type { Friend, Item } from '@root/types/plex.types.js'
import {
  needsTmdbPoster,
  type PosterResolverDeps,
  resolveTmdbPosters,
} from '@services/plex-watchlist/enrichment/poster-resolver.js'
import type { TmdbService } from '@services/tmdb.service.js'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

function friend(userId: number, username: string): Friend {
  return {
    watchlistId: `watchlist-${userId}`,
    username,
    userId,
  }
}

function item(overrides: Partial<Item> & Pick<Item, 'key'>): Item {
  return {
    title: 'Some Title',
    type: 'movie',
    guids: ['tmdb:550'],
    genres: [],
    user_id: 1,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('needsTmdbPoster', () => {
  it('returns true for a missing thumb', () => {
    expect(needsTmdbPoster(undefined)).toBe(true)
  })

  it('returns true for an empty thumb', () => {
    expect(needsTmdbPoster('')).toBe(true)
  })

  it('returns true for a Plex-hosted thumb', () => {
    expect(needsTmdbPoster('https://metadata-static.plex.tv/x.jpg')).toBe(true)
  })

  it('returns true for a plain http thumb', () => {
    expect(needsTmdbPoster('http://example.com/x.jpg')).toBe(true)
  })

  it('returns false for a TMDB path', () => {
    expect(needsTmdbPoster('/abc.jpg')).toBe(false)
  })
})

describe('resolveTmdbPosters', () => {
  let getPosterPath: Mock<TmdbService['getPosterPath']>
  let isConfigured: Mock<TmdbService['isConfigured']>
  let deps: PosterResolverDeps

  beforeEach(() => {
    vi.clearAllMocks()
    getPosterPath = vi.fn<TmdbService['getPosterPath']>()
    getPosterPath.mockResolvedValue('/resolved.jpg')
    isConfigured = vi.fn<TmdbService['isConfigured']>()
    isConfigured.mockReturnValue(true)

    deps = {
      tmdb: { getPosterPath, isConfigured },
      logger: createMockLogger(),
    }
  })

  it('does nothing when TMDB is not configured', async () => {
    isConfigured.mockReturnValue(false)
    const target = item({ key: 'a', thumb: 'https://plex.tv/a.jpg' })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([target])]]),
      deps,
    )

    expect(getPosterPath).not.toHaveBeenCalled()
    expect(target.thumb).toBe('https://plex.tv/a.jpg')
  })

  it('skips items that already carry a TMDB path', async () => {
    const target = item({ key: 'a', thumb: '/already.jpg' })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([target])]]),
      deps,
    )

    expect(getPosterPath).not.toHaveBeenCalled()
    expect(target.thumb).toBe('/already.jpg')
  })

  it('replaces an http thumb with the resolved poster path', async () => {
    const target = item({
      key: 'a',
      thumb: 'https://metadata-static.plex.tv/a.jpg',
    })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([target])]]),
      deps,
    )

    expect(getPosterPath).toHaveBeenCalledTimes(1)
    expect(target.thumb).toBe('/resolved.jpg')
  })

  it('fills in a missing thumb', async () => {
    const target = item({ key: 'a' })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([target])]]),
      deps,
    )

    expect(target.thumb).toBe('/resolved.jpg')
  })

  it('leaves the thumb untouched on a miss', async () => {
    getPosterPath.mockResolvedValue(null)
    const target = item({ key: 'a', thumb: 'https://plex.tv/a.jpg' })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([target])]]),
      deps,
    )

    expect(target.thumb).toBe('https://plex.tv/a.jpg')
  })

  it('leaves the thumb untouched when the lookup rejects and still resolves the rest', async () => {
    getPosterPath.mockImplementation(async (guids) => {
      if (Array.isArray(guids) && guids.includes('tmdb:1')) {
        throw new Error('boom')
      }
      return '/ok.jpg'
    })

    const failing = item({
      key: 'a',
      guids: ['tmdb:1'],
      thumb: 'https://plex.tv/a.jpg',
    })
    const succeeding = item({ key: 'b', guids: ['tmdb:2'] })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([failing, succeeding])]]),
      deps,
    )

    expect(failing.thumb).toBe('https://plex.tv/a.jpg')
    expect(succeeding.thumb).toBe('/ok.jpg')
  })

  it('looks up a shared key once and updates every copy', async () => {
    const alicesCopy = item({ key: 'shared', user_id: 1 })
    const bobsCopy = item({ key: 'shared', user_id: 2 })

    await resolveTmdbPosters(
      new Map([
        [friend(1, 'alice'), new Set([alicesCopy])],
        [friend(2, 'bob'), new Set([bobsCopy])],
      ]),
      deps,
    )

    expect(getPosterPath).toHaveBeenCalledTimes(1)
    expect(alicesCopy.thumb).toBe('/resolved.jpg')
    expect(bobsCopy.thumb).toBe('/resolved.jpg')
  })

  it('passes the content type through for shows and movies', async () => {
    const show = item({ key: 'show', type: 'show', guids: ['tvdb:81189'] })
    const movie = item({ key: 'movie', type: 'movie', guids: ['tmdb:550'] })

    await resolveTmdbPosters(
      new Map([[friend(1, 'alice'), new Set([show, movie])]]),
      deps,
    )

    expect(getPosterPath).toHaveBeenCalledWith(['tvdb:81189'], 'show')
    expect(getPosterPath).toHaveBeenCalledWith(['tmdb:550'], 'movie')
  })
})
