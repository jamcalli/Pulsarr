import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { StatusService } from '@services/watchlist-status.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

const watchlistItem = (type: 'show' | 'movie', guid: string) => ({
  id: 1,
  user_id: 1,
  title: 'Item',
  key: 'key-1',
  type,
  guids: [guid],
  status: 'grabbed' as const,
})

const series = (
  instanceId: number,
  status: 'requested' | 'grabbed',
): SonarrItem => ({
  title: 'Show',
  guids: ['tvdb:100'],
  type: 'show',
  status,
  series_status: 'continuing',
  sonarr_instance_id: instanceId,
})

const movie = (
  instanceId: number,
  status: 'requested' | 'grabbed',
): RadarrItem => ({
  title: 'Movie',
  guids: ['tmdb:300'],
  type: 'movie',
  status,
  movie_status: status === 'grabbed' ? 'available' : 'unavailable',
  radarr_instance_id: instanceId,
})

describe('StatusService availability reconciliation', () => {
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
      watchlistItem('show', 'tvdb:100'),
    ])
    db.getAllMovieWatchlistItems.mockResolvedValue([
      watchlistItem('movie', 'tmdb:300'),
    ])
    db.bulkUpdateWatchlistItems.mockResolvedValue(1)
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

  /** Every status proposed to bulkUpdateWatchlistItems across all calls */
  const proposedStatuses = () =>
    db.bulkUpdateWatchlistItems.mock.calls.flatMap(([updates]) =>
      (updates as Array<{ status?: string }>)
        .map((u) => u.status)
        .filter((s) => s !== undefined),
    )

  it('lets the Sonarr reconciler reset a series with no files to requested', async () => {
    await service.syncSonarrStatuses([series(1, 'requested')])

    expect(db.bulkUpdateWatchlistItems).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'key-1', status: 'requested' })],
      { reconcileAvailability: true },
    )
  })

  it('lets the Radarr reconciler reset a movie with no file to requested', async () => {
    await service.syncRadarrStatuses([movie(1, 'requested')])

    expect(db.bulkUpdateWatchlistItems).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'key-1', status: 'requested' })],
      { reconcileAvailability: true },
    )
  })

  it('resets when no instance reports files', async () => {
    await service.syncSonarrStatuses([
      series(1, 'requested'),
      series(2, 'requested'),
    ])

    expect(proposedStatuses()).toEqual(['requested'])
  })

  describe.each([
    ['the first instance', [1, 2]],
    ['the second instance', [2, 1]],
  ])('title has files on %s only', (_label, order) => {
    // Instance 1 has files, instance 2 does not; order is the fetch order
    const statusFor = (id: number) => (id === 1 ? 'grabbed' : 'requested')

    it('does not reset a series that another instance still has', async () => {
      await service.syncSonarrStatuses(
        order.map((id) => series(id, statusFor(id))),
      )

      expect(proposedStatuses()).toEqual([])
    })

    it('does not reset a movie that another instance still has', async () => {
      await service.syncRadarrStatuses(
        order.map((id) => movie(id, statusFor(id))),
      )

      expect(proposedStatuses()).toEqual([])
    })
  })

  it('does not reset anything when an instance cannot be fetched', async () => {
    sonarrManager.fetchAllSeries.mockRejectedValue(
      new Error('Failed to fetch series from 1 Sonarr instance(s)'),
    )
    radarrManager.fetchAllMovies.mockRejectedValue(
      new Error('Failed to fetch movies from 1 Radarr instance(s)'),
    )

    await expect(service.syncSonarrStatuses()).rejects.toThrow()
    await expect(service.syncRadarrStatuses()).rejects.toThrow()

    expect(db.bulkUpdateWatchlistItems).not.toHaveBeenCalled()
  })
})
