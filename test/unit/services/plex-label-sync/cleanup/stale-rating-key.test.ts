import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { PlexMetadata } from '@root/types/plex-server.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  resolveStaleRatingKey,
  type StaleRatingKeyDeps,
} from '@services/plex-label-sync/cleanup/stale-rating-key.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('stale-rating-key', () => {
  let mockPlexServer: PlexServerService
  let mockDb: DatabaseService
  let deps: StaleRatingKeyDeps

  const plexItem = (ratingKey: string): PlexMetadata => ({
    ratingKey,
    key: `/library/metadata/${ratingKey}`,
    guid: 'plex://movie/abc',
    type: 'movie',
    title: 'Movie',
  })

  const watchlistItem = (key: string, type: string): TokenWatchlistItem => ({
    id: '1',
    title: 'Movie',
    key,
    type,
    user_id: 1,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  })

  beforeEach(() => {
    mockPlexServer = {
      searchByGuid: vi.fn().mockResolvedValue([]),
    } as unknown as PlexServerService

    mockDb = {
      getWatchlistItemsByGuid: vi.fn().mockResolvedValue([]),
      updateTrackingRatingKey: vi.fn().mockResolvedValue(1),
      cleanupRatingKeyTracking: vi.fn().mockResolvedValue(1),
    } as unknown as DatabaseService

    deps = {
      plexServer: mockPlexServer,
      db: mockDb,
      logger: createMockLogger(),
    }
  })

  it('relocates tracking when a guid resolves to a new rating key', async () => {
    vi.mocked(mockDb.getWatchlistItemsByGuid).mockResolvedValue([
      watchlistItem('abc', 'movie'),
    ])
    vi.mocked(mockPlexServer.searchByGuid).mockResolvedValue([plexItem('999')])

    const result = await resolveStaleRatingKey(deps, '123', ['tmdb:1'])

    expect(result).toEqual({ outcome: 'relocated', ratingKey: '999' })
    expect(mockPlexServer.searchByGuid).toHaveBeenCalledWith('plex://movie/abc')
    expect(mockDb.updateTrackingRatingKey).toHaveBeenCalledWith('123', '999')
    expect(mockDb.cleanupRatingKeyTracking).not.toHaveBeenCalled()
  })

  it('tries the next guid when the first does not resolve', async () => {
    vi.mocked(mockDb.getWatchlistItemsByGuid).mockImplementation(
      async (guid) => (guid === 'tvdb:2' ? [watchlistItem('def', 'show')] : []),
    )
    vi.mocked(mockPlexServer.searchByGuid).mockResolvedValue([plexItem('555')])

    const result = await resolveStaleRatingKey(deps, '123', [
      'tmdb:1',
      'tvdb:2',
    ])

    expect(result).toEqual({ outcome: 'relocated', ratingKey: '555' })
    expect(mockDb.getWatchlistItemsByGuid).toHaveBeenCalledTimes(2)
    expect(mockPlexServer.searchByGuid).toHaveBeenCalledWith('plex://show/def')
  })

  it('deletes tracking when no guid resolves to a Plex item', async () => {
    vi.mocked(mockDb.getWatchlistItemsByGuid).mockResolvedValue([
      watchlistItem('abc', 'movie'),
    ])

    const result = await resolveStaleRatingKey(deps, '123', [
      'tmdb:1',
      'imdb:tt1',
    ])

    expect(result).toEqual({ outcome: 'deleted' })
    expect(mockDb.cleanupRatingKeyTracking).toHaveBeenCalledWith('123')
    expect(mockDb.updateTrackingRatingKey).not.toHaveBeenCalled()
  })
})
