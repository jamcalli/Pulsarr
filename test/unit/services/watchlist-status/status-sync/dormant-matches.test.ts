import type { ExistingContentMode } from '@root/schemas/common/existing-content-mode.schema.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  DatabaseWatchlistItem,
  WatchlistStatus,
} from '@root/types/watchlist-status.types.js'
import {
  type DormantCopyChecker,
  dropDormantMatches,
} from '@services/watchlist-status/status-sync/dormant-matches.js'
import {
  createRadarrStatusConfig,
  processStatusUpdates,
} from '@services/watchlist-status/status-sync/status-processor.js'
import { extractTmdbId } from '@utils/guid-handler.js'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const ADDED = '2026-01-01T00:00:00Z'

function watchlistItem(status: WatchlistStatus): DatabaseWatchlistItem {
  return {
    id: 1,
    user_id: 7,
    title: 'Movie',
    key: 'movie-key',
    type: 'movie',
    added: ADDED,
    guids: ['tmdb:100'],
    status,
    movie_status: 'unavailable',
  }
}

function copyOn(instanceId: number): RadarrItem {
  return {
    title: 'Movie',
    type: 'movie',
    guids: ['tmdb:100'],
    added: ADDED,
    status: 'requested',
    movie_status: 'unavailable',
    radarr_instance_id: instanceId,
  }
}

const locate = (movie: RadarrItem) => ({
  instanceId: movie.radarr_instance_id,
  externalId: extractTmdbId(movie.guids),
})

describe('dropDormantMatches', () => {
  let modes: Record<number, ExistingContentMode>
  let dormantOn: Set<number>
  let hasDormantCopy: Mock<DormantCopyChecker['hasDormantCopy']>
  let checker: DormantCopyChecker

  beforeEach(() => {
    modes = { 1: 'dormant', 2: 'off' }
    dormantOn = new Set([1])
    hasDormantCopy = vi.fn<DormantCopyChecker['hasDormantCopy']>(
      async (instanceId) => dormantOn.has(instanceId),
    )
    checker = {
      getAllInstances: async () =>
        Object.entries(modes).map(([id, existingContentMode]) => ({
          id: Number(id),
          existingContentMode,
        })),
      hasDormantCopy,
    }
  })

  async function sync(item: DatabaseWatchlistItem, ...copies: RadarrItem[]) {
    const logger = createMockLogger()
    const matches = await dropDormantMatches(
      logger,
      checker,
      locate,
      new Map([[1, copies]]),
      [item],
    )
    return processStatusUpdates(
      { logger },
      createRadarrStatusConfig(logger),
      matches,
      [item],
    )
  }

  it('keeps a pending row pending when its copy is dormant on a reactivating instance', async () => {
    expect(await sync(watchlistItem('pending'), copyOn(1))).toEqual([])
    expect(hasDormantCopy).toHaveBeenCalledWith(1, 100)
  })

  it('upgrades a pending row from a healthy copy', async () => {
    dormantOn.clear()

    expect(await sync(watchlistItem('pending'), copyOn(1))).toEqual([
      { userId: 7, key: 'movie-key', status: 'requested' },
    ])
  })

  it('never checks the copies of a row that is not pending', async () => {
    const item = watchlistItem('requested')

    expect(await sync(item, { ...copyOn(1), status: 'grabbed' })).toEqual([
      { userId: 7, key: 'movie-key', status: 'grabbed' },
    ])
    expect(hasDormantCopy).not.toHaveBeenCalled()
  })

  it('keeps a pending row pending when the lookup fails', async () => {
    hasDormantCopy.mockRejectedValue(new Error('radarr down'))

    expect(await sync(watchlistItem('pending'), copyOn(1))).toEqual([])
  })

  it('upgrades a pending row from a healthy copy beside a dormant one', async () => {
    expect(
      await sync(watchlistItem('pending'), copyOn(1), {
        ...copyOn(2),
        status: 'grabbed',
      }),
    ).toEqual([{ userId: 7, key: 'movie-key', status: 'grabbed' }])
    expect(hasDormantCopy).toHaveBeenCalledTimes(1)
  })

  it('looks up a copy shared by two pending rows once and holds both', async () => {
    const first = watchlistItem('pending')
    const second = { ...watchlistItem('pending'), id: 2, user_id: 8 }

    const matches = await dropDormantMatches(
      createMockLogger(),
      checker,
      locate,
      new Map([
        [1, [copyOn(1)]],
        [2, [copyOn(1)]],
      ]),
      [first, second],
    )

    expect(matches.get(1)).toEqual([])
    expect(matches.get(2)).toEqual([])
    expect(hasDormantCopy).toHaveBeenCalledTimes(1)
  })

  it('looks up each distinct title once', async () => {
    const second = {
      ...watchlistItem('pending'),
      id: 2,
      key: 'other-key',
      guids: ['tmdb:200'],
    }

    await dropDormantMatches(
      createMockLogger(),
      checker,
      locate,
      new Map([
        [1, [copyOn(1)]],
        [2, [{ ...copyOn(1), guids: ['tmdb:200'] }]],
      ]),
      [watchlistItem('pending'), second],
    )

    expect(hasDormantCopy).toHaveBeenCalledTimes(2)
    expect(hasDormantCopy).toHaveBeenCalledWith(1, 100)
    expect(hasDormantCopy).toHaveBeenCalledWith(1, 200)
  })

  it('returns the matches untouched without any lookup when no instance reactivates', async () => {
    modes = { 1: 'off', 2: 'off' }
    const matches = new Map([[1, [copyOn(1)]]])

    expect(
      await dropDormantMatches(createMockLogger(), checker, locate, matches, [
        watchlistItem('pending'),
      ]),
    ).toBe(matches)
    expect(hasDormantCopy).not.toHaveBeenCalled()
  })
})
