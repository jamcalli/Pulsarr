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
        _arrItems: unknown,
        items: DatabaseWatchlistItem[],
      ) => items.map((item) => ({ userId: item.user_id, key: item.key })),
    ),
  }),
)

vi.mock(
  '@services/watchlist-status/junction/junction-processor.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    processJunctionUpdates: vi.fn(async () => ({ updated: 0, userIds: [] })),
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
})
