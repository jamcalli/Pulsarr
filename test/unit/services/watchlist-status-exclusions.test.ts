import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { StatusService } from '@services/watchlist-status.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

const dbItem = (id: number, type: 'show' | 'movie', guid: string) => ({
  id,
  user_id: 1,
  title: `Item ${id}`,
  key: `key-${id}`,
  type,
  guids: [guid],
  status: 'pending' as const,
})

const showItem = (overrides: Partial<SonarrItem>): SonarrItem => ({
  title: 'Show',
  guids: [],
  type: 'show',
  status: 'requested',
  series_status: 'continuing',
  sonarr_instance_id: 1,
  ...overrides,
})

const movieItem = (overrides: Partial<RadarrItem>): RadarrItem => ({
  title: 'Movie',
  guids: [],
  type: 'movie',
  status: 'requested',
  movie_status: 'unavailable',
  radarr_instance_id: 1,
  ...overrides,
})

describe('StatusService import-list exclusions', () => {
  const db = {
    getAllShowWatchlistItems: vi.fn(),
    getAllMovieWatchlistItems: vi.fn(),
    bulkUpdateWatchlistItems: vi.fn(),
    getAllWatchlistSonarrInstanceJunctions: vi.fn(),
    getAllWatchlistRadarrInstanceJunctions: vi.fn(),
    bulkAddWatchlistToSonarrInstances: vi.fn(),
    bulkAddWatchlistToRadarrInstances: vi.fn(),
    bulkUpdateWatchlistSonarrInstanceStatuses: vi.fn(),
    bulkUpdateWatchlistRadarrInstanceStatuses: vi.fn(),
    bulkRemoveWatchlistFromSonarrInstances: vi.fn(),
    bulkRemoveWatchlistFromRadarrInstances: vi.fn(),
  }
  const sonarrManager = { fetchAllSeries: vi.fn() }
  const radarrManager = { fetchAllMovies: vi.fn() }
  let service: StatusService

  beforeEach(() => {
    vi.clearAllMocks()
    db.getAllShowWatchlistItems.mockResolvedValue([
      dbItem(1, 'show', 'tvdb:100'),
      dbItem(2, 'show', 'tvdb:200'),
    ])
    db.getAllMovieWatchlistItems.mockResolvedValue([
      dbItem(3, 'movie', 'tmdb:300'),
      dbItem(4, 'movie', 'tmdb:400'),
    ])
    db.bulkUpdateWatchlistItems.mockResolvedValue(0)
    db.getAllWatchlistSonarrInstanceJunctions.mockResolvedValue([])
    db.getAllWatchlistRadarrInstanceJunctions.mockResolvedValue([])
    service = new StatusService(
      createMockLogger(),
      db as unknown as FastifyInstance['db'],
      sonarrManager as unknown as FastifyInstance['sonarrManager'],
      radarrManager as unknown as FastifyInstance['radarrManager'],
      { config: {} } as unknown as FastifyInstance,
    )
  })

  const bulkAddedIds = (mock: ReturnType<typeof vi.fn>) =>
    mock.mock.calls.flatMap(([entries]) =>
      (entries as Array<{ watchlist_id: number }>).map((e) => e.watchlist_id),
    )

  const updatedKeys = () =>
    db.bulkUpdateWatchlistItems.mock.calls.flatMap(([updates]) =>
      (updates as Array<{ key: string }>).map((u) => u.key),
    )

  it('ignores excluded series in prefetched data', async () => {
    await service.syncSonarrStatuses([
      showItem({ guids: ['tvdb:100'], status: 'grabbed' }),
      showItem({ guids: ['tvdb:200'], isExclusion: true }),
    ])

    expect(updatedKeys()).toEqual(['key-1'])
    expect(bulkAddedIds(db.bulkAddWatchlistToSonarrInstances)).toEqual([1])
  })

  it('ignores excluded movies in prefetched data', async () => {
    await service.syncRadarrStatuses([
      movieItem({
        guids: ['tmdb:300'],
        status: 'grabbed',
        movie_status: 'available',
      }),
      movieItem({ guids: ['tmdb:400'], isExclusion: true }),
    ])

    expect(updatedKeys()).toEqual(['key-3'])
    expect(bulkAddedIds(db.bulkAddWatchlistToRadarrInstances)).toEqual([3])
  })
})
