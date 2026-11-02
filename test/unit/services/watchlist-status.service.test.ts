import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

vi.mock(
  '@services/watchlist-status/status-sync/status-processor.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    processStatusUpdates: vi.fn(
      (
        _deps: unknown,
        _config: unknown,
        _matches: unknown,
        items: DatabaseWatchlistItem[],
      ) => items.map((item) => ({ userId: item.user_id, key: item.key })),
    ),
  }),
)

vi.mock(
  '@services/watchlist-status/junction/junction-processor.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    processJunctionUpdates: vi.fn(async () => ({
      updated: 0,
      userIds: [],
      matches: new Map(),
    })),
  }),
)

import { processJunctionUpdates } from '@services/watchlist-status/junction/junction-processor.js'
import { processStatusUpdates } from '@services/watchlist-status/status-sync/status-processor.js'
import { StatusService } from '@services/watchlist-status.service.js'

function rows(userIds: number[]) {
  return userIds.map((userId) => ({
    id: userId,
    user_id: userId,
    key: `k${userId}`,
  }))
}

function createService(showUserIds: number[], movieUserIds: number[]) {
  const emit = vi.fn()
  const db = {
    getAllShowWatchlistItems: vi.fn(async () => rows(showUserIds)),
    getAllMovieWatchlistItems: vi.fn(async () => rows(movieUserIds)),
    bulkUpdateWatchlistItems: vi.fn(
      async (updates: unknown[]) => updates.length,
    ),
  }
  const fastify = {
    config: {},
    progress: { emit, hasActiveConnections: () => false },
  }
  const service = new StatusService(
    createMockLogger(),
    db as unknown as FastifyInstance['db'],
    {} as FastifyInstance['sonarrManager'],
    {} as FastifyInstance['radarrManager'],
    fastify as unknown as FastifyInstance,
  )
  return { service, emit, db }
}

describe('StatusService.syncAllStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits one watchlist status event for every user with an update', async () => {
    const { service, emit } = createService([1, 2], [2, 3])

    const result = await service.syncAllStatuses({
      existingSeries: [],
      existingMovies: [],
    })

    expect(result).toEqual({ shows: 2, movies: 2 })
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'watchlist',
        metadata: { action: 'status', userIds: [1, 2, 3] },
      }),
    )
  })

  it('emits nothing when no item changed', async () => {
    const { service, emit } = createService([], [])

    await service.syncAllStatuses({ existingSeries: [], existingMovies: [] })

    expect(emit).not.toHaveBeenCalled()
  })

  it('emits the users Sonarr updated before Radarr failed, then rejects', async () => {
    const { service, emit, db } = createService([3], [])
    db.getAllMovieWatchlistItems.mockRejectedValueOnce(new Error('radarr down'))

    await expect(
      service.syncAllStatuses({ existingSeries: [], existingMovies: [] }),
    ).rejects.toThrow('radarr down')

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { action: 'status', userIds: [3] },
      }),
    )
  })

  it('emits the users whose only change was a junction row', async () => {
    vi.mocked(processStatusUpdates)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
    vi.mocked(processJunctionUpdates).mockImplementation(
      async (_deps, _config, _arrItems, items) => ({
        updated: items.length,
        userIds: items.map((item) => item.user_id),
        matches: new Map(),
      }),
    )
    const { service, emit } = createService([], [4])

    const result = await service.syncAllStatuses({
      existingSeries: [],
      existingMovies: [],
    })

    expect(result).toEqual({ shows: 0, movies: 1 })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { action: 'status', userIds: [4] },
      }),
    )
  })

  it('feeds the junction matches to the main pass', async () => {
    const matches = new Map([[1, [{ guids: ['tvdb:100'] } as SonarrItem]]])
    vi.mocked(processJunctionUpdates).mockResolvedValueOnce({
      updated: 0,
      userIds: [],
      matches,
    })
    const { service } = createService([1], [])

    await service.syncSonarrStatuses([])

    expect(vi.mocked(processStatusUpdates).mock.calls[0][2]).toBe(matches)
  })

  it('emits the junction users when the main write fails, then rejects', async () => {
    vi.mocked(processJunctionUpdates).mockImplementation(
      async (_deps, _config, _arrItems, items) => ({
        updated: items.length,
        userIds: items.map((item) => item.user_id),
        matches: new Map(),
      }),
    )
    const { service, emit, db } = createService([5], [])
    db.bulkUpdateWatchlistItems.mockRejectedValueOnce(new Error('write failed'))

    await expect(
      service.syncAllStatuses({ existingSeries: [], existingMovies: [] }),
    ).rejects.toThrow('write failed')

    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { action: 'status', userIds: [5] },
      }),
    )
  })
})

describe('StatusService import-list exclusions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const arrGuids = (mock: ReturnType<typeof vi.fn>) =>
    mock.mock.calls.map(([, , arrItems]) =>
      (arrItems as Array<{ guids: string[] }>).flatMap((item) => item.guids),
    )

  it('ignores excluded series in prefetched data', async () => {
    const { service } = createService([1], [])

    await service.syncSonarrStatuses([
      { guids: ['tvdb:100'], status: 'grabbed' },
      { guids: ['tvdb:200'], status: 'requested', isExclusion: true },
    ] as SonarrItem[])

    expect(arrGuids(vi.mocked(processJunctionUpdates))).toEqual([['tvdb:100']])
  })

  it('ignores excluded movies in prefetched data', async () => {
    const { service } = createService([], [1])

    await service.syncRadarrStatuses([
      { guids: ['tmdb:300'], status: 'grabbed' },
      { guids: ['tmdb:400'], status: 'requested', isExclusion: true },
    ] as RadarrItem[])

    expect(arrGuids(vi.mocked(processJunctionUpdates))).toEqual([['tmdb:300']])
  })
})

describe('StatusService.syncInstance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createInstanceSync() {
    const emit = vi.fn()
    const db = {
      getAllShowWatchlistItems: vi.fn(async () => rows([1])),
      getAllMovieWatchlistItems: vi.fn(async () => rows([2])),
      bulkUpdateWatchlistItems: vi.fn(
        async (updates: unknown[]) => updates.length,
      ),
    }
    const sonarrManager = { fetchAllSeries: vi.fn(async () => []) }
    const radarrManager = { fetchAllMovies: vi.fn(async () => []) }
    const service = new StatusService(
      createMockLogger(),
      db as unknown as FastifyInstance['db'],
      sonarrManager as unknown as FastifyInstance['sonarrManager'],
      radarrManager as unknown as FastifyInstance['radarrManager'],
      {
        config: {},
        progress: { emit, hasActiveConnections: () => false },
      } as unknown as FastifyInstance,
    )
    return { service, emit, db, sonarrManager, radarrManager }
  }

  it('syncs only Radarr statuses after a Radarr copy and emits its users', async () => {
    const { service, emit, sonarrManager, radarrManager } = createInstanceSync()
    vi.spyOn(service, 'syncRadarrInstance').mockResolvedValue(3)

    await expect(service.syncInstance(1, 'radarr')).resolves.toBe(3)

    expect(radarrManager.fetchAllMovies).toHaveBeenCalledTimes(1)
    expect(sonarrManager.fetchAllSeries).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { action: 'status', userIds: [2] },
      }),
    )
  })

  it('syncs only Sonarr statuses after a Sonarr copy and emits its users', async () => {
    const { service, emit, sonarrManager, radarrManager } = createInstanceSync()
    vi.spyOn(service, 'syncSonarrInstance').mockResolvedValue(4)

    await expect(service.syncInstance(1, 'sonarr')).resolves.toBe(4)

    expect(sonarrManager.fetchAllSeries).toHaveBeenCalledTimes(1)
    expect(radarrManager.fetchAllMovies).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { action: 'status', userIds: [1] },
      }),
    )
  })

  it('rejects when the status sync fails', async () => {
    const { service, radarrManager } = createInstanceSync()
    vi.spyOn(service, 'syncRadarrInstance').mockResolvedValue(1)
    radarrManager.fetchAllMovies.mockRejectedValueOnce(new Error('radarr down'))

    await expect(service.syncInstance(1, 'radarr')).rejects.toThrow(
      'radarr down',
    )
  })
})
