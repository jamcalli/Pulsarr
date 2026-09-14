import type { User } from '@root/types/config.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { RadarrItem } from '@root/types/radarr.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import type { SyncResult } from '@services/watchlist-workflow/orchestration/sync-engine.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/routing/content-router.js', () => ({
  routeMovie: vi.fn(async () => ({ routed: true })),
  routeShow: vi.fn(async () => ({ routed: true })),
}))

vi.mock(
  '@services/watchlist-workflow/attribution/approval-attributor.js',
  () => ({
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
  }),
)

vi.mock('@services/watchlist-workflow/quota/watchlist-cap-gate.js', () => ({
  evaluateWatchlistCaps: vi.fn(async () => ({
    skipIds: new Set<string>(),
    skippedCount: 0,
    cappedEntries: [],
  })),
}))

import { updateAutoApprovalUserAttribution } from '@services/watchlist-workflow/attribution/approval-attributor.js'
import { syncWatchlistItems } from '@services/watchlist-workflow/orchestration/sync-engine.js'
import { evaluateWatchlistCaps } from '@services/watchlist-workflow/quota/watchlist-cap-gate.js'
import {
  routeMovie,
  routeShow,
} from '@services/watchlist-workflow/routing/content-router.js'

const ROUTING_SKIP_REASONS = ['default-skip', 'excluded'] as const
const PRIMARY_USER = createMockUser(1, 'primary')
const SECOND_USER = createMockUser(2, 'second')

function showItem(
  overrides: Partial<TokenWatchlistItem> = {},
): TokenWatchlistItem {
  return {
    id: 'show-1',
    title: 'Show One',
    key: 'show-key-1',
    type: 'show',
    guids: ['tvdb:111'],
    genres: [],
    user_id: PRIMARY_USER.id,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function movieItem(
  overrides: Partial<TokenWatchlistItem> = {},
): TokenWatchlistItem {
  return {
    id: 'movie-1',
    title: 'Movie One',
    key: 'movie-key-1',
    type: 'movie',
    guids: ['tmdb:222'],
    genres: [],
    user_id: PRIMARY_USER.id,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function zeroResult(): SyncResult {
  return {
    added: { shows: 0, movies: 0 },
    unmatched: { shows: 0, movies: 0 },
    skippedDueToUserSetting: 0,
    skippedDueToMissingIds: 0,
    skippedDueToWatchlistCap: 0,
    skippedDueToExclusion: 0,
    skippedDueToRouting: 0,
  }
}

function createDeps() {
  const parts = {
    db: {
      getAllUsers: vi.fn(async () => [PRIMARY_USER, SECOND_USER]),
      getPrimaryUser: vi.fn(
        async (): Promise<User | undefined> => PRIMARY_USER,
      ),
      getAllShowWatchlistItems: vi.fn(
        async (): Promise<TokenWatchlistItem[]> => [],
      ),
      getAllMovieWatchlistItems: vi.fn(
        async (): Promise<TokenWatchlistItem[]> => [],
      ),
      getExclusionMap: vi.fn(async () => new Map<string, Set<number>>()),
    },
    sonarrManager: {
      checkInstancesHealth: vi.fn(async () => ({
        available: [1],
        unavailable: [] as number[],
      })),
      fetchAllSeries: vi.fn(async (): Promise<SonarrItem[]> => []),
    },
    radarrManager: {
      checkInstancesHealth: vi.fn(async () => ({
        available: [1],
        unavailable: [] as number[],
      })),
      fetchAllMovies: vi.fn(async (): Promise<RadarrItem[]> => []),
    },
    plexServerService: {
      clearPlexResourcesCache: vi.fn(),
      clearContentCacheForReconciliation: vi.fn(),
      checkPlexServerHealth: vi.fn(async () => ({
        reachable: true,
        serverName: 'test-plex',
      })),
    },
    notifications: { sendWatchlistCapReached: vi.fn() },
    statusService: {
      syncAllStatuses: vi.fn(async () => ({ shows: 0, movies: 0 })),
    },
  }

  const config = { skipIfExistsOnPlex: false }

  const deps = createWorkflowDeps({ ...parts, config })

  return { deps, parts, config }
}

describe('syncWatchlistItems', () => {
  let deps: WorkflowDeps
  let parts: ReturnType<typeof createDeps>['parts']
  let config: ReturnType<typeof createDeps>['config']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(routeShow).mockResolvedValue({ routed: true })
    vi.mocked(routeMovie).mockResolvedValue({ routed: true })
    vi.mocked(evaluateWatchlistCaps).mockResolvedValue({
      skipIds: new Set<string>(),
      skippedCount: 0,
      cappedEntries: [],
    })

    const created = createDeps()
    deps = created.deps
    parts = created.parts
    config = created.config
  })

  it('returns an empty result when no instances are configured', async () => {
    parts.sonarrManager.checkInstancesHealth.mockResolvedValue({
      available: [],
      unavailable: [],
    })
    parts.radarrManager.checkInstancesHealth.mockResolvedValue({
      available: [],
      unavailable: [],
    })

    const result = await syncWatchlistItems(deps)

    expect(result).toEqual(zeroResult())
    expect(parts.db.getAllUsers).not.toHaveBeenCalled()
  })

  it('aborts when any instance is unavailable', async () => {
    parts.sonarrManager.checkInstancesHealth.mockResolvedValue({
      available: [],
      unavailable: [1],
    })
    parts.db.getAllShowWatchlistItems.mockResolvedValue([showItem()])

    const result = await syncWatchlistItems(deps)

    expect(result).toEqual(zeroResult())
    expect(routeShow).not.toHaveBeenCalled()
    expect(parts.db.getAllUsers).not.toHaveBeenCalled()
  })

  it('aborts when the plex server is unreachable and skipIfExistsOnPlex is on', async () => {
    config.skipIfExistsOnPlex = true
    parts.plexServerService.checkPlexServerHealth.mockResolvedValue({
      reachable: false,
      serverName: 'test-plex',
    })
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([movieItem()])

    const result = await syncWatchlistItems(deps)

    expect(result).toEqual(zeroResult())
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it('proceeds when the plex server is reachable and skipIfExistsOnPlex is on', async () => {
    config.skipIfExistsOnPlex = true
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([movieItem()])

    const result = await syncWatchlistItems(deps)

    expect(parts.plexServerService.checkPlexServerHealth).toHaveBeenCalledTimes(
      1,
    )
    expect(result.added.movies).toBe(1)
  })

  it('routes one show and one movie and runs the post-sync tasks', async () => {
    const shows = [showItem()]
    const movies = [movieItem()]
    const existingSeries: SonarrItem[] = [
      { title: 'Show One', type: 'show', guids: ['tvdb:111'] },
    ]
    const existingMovies: RadarrItem[] = [
      { title: 'Movie One', type: 'movie', guids: ['tmdb:222'] },
    ]
    parts.db.getAllShowWatchlistItems.mockResolvedValue(shows)
    parts.db.getAllMovieWatchlistItems.mockResolvedValue(movies)
    parts.sonarrManager.fetchAllSeries.mockResolvedValue(existingSeries)
    parts.radarrManager.fetchAllMovies.mockResolvedValue(existingMovies)

    const result = await syncWatchlistItems(deps)

    expect(result.added).toEqual({ shows: 1, movies: 1 })
    expect(vi.mocked(routeShow).mock.calls[0][0]).toMatchObject({
      userId: PRIMARY_USER.id,
      userName: PRIMARY_USER.name,
      existingSeries,
      primaryUser: PRIMARY_USER,
    })
    expect(vi.mocked(routeMovie).mock.calls[0][0]).toMatchObject({
      userId: PRIMARY_USER.id,
      userName: PRIMARY_USER.name,
      existingMovies,
      primaryUser: PRIMARY_USER,
    })
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledWith(deps, {
      shows,
      movies,
      userById: new Map([
        [PRIMARY_USER.id, PRIMARY_USER],
        [SECOND_USER.id, SECOND_USER],
      ]),
    })
    expect(parts.statusService.syncAllStatuses).toHaveBeenCalledWith({
      existingSeries,
      existingMovies,
    })
  })

  it('skips items owned by a user with sync disabled', async () => {
    parts.db.getAllUsers.mockResolvedValue([
      PRIMARY_USER,
      { ...SECOND_USER, can_sync: false },
    ])
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([
      movieItem({ user_id: SECOND_USER.id }),
    ])

    const result = await syncWatchlistItems(deps)

    expect(result.skippedDueToUserSetting).toBe(1)
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it('skips items the cap gate flagged', async () => {
    vi.mocked(evaluateWatchlistCaps).mockResolvedValue({
      skipIds: new Set(['movie-1']),
      skippedCount: 1,
      cappedEntries: [],
    })
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([movieItem()])

    const result = await syncWatchlistItems(deps)

    expect(result.skippedDueToWatchlistCap).toBe(1)
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it('notifies each capped user with their resolved name', async () => {
    vi.mocked(evaluateWatchlistCaps).mockResolvedValue({
      skipIds: new Set<string>(),
      skippedCount: 0,
      cappedEntries: [
        {
          userId: SECOND_USER.id,
          contentType: 'movie',
          currentCount: 12,
          cap: 10,
        },
      ],
    })

    await syncWatchlistItems(deps)

    expect(parts.notifications.sendWatchlistCapReached).toHaveBeenCalledWith({
      userId: SECOND_USER.id,
      userName: SECOND_USER.name,
      contentType: 'movie',
      currentCount: 12,
      cap: 10,
    })
  })

  it('skips items excluded by the owning user', async () => {
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([movieItem()])
    parts.db.getExclusionMap.mockResolvedValue(
      new Map([['movie-key-1', new Set([PRIMARY_USER.id])]]),
    )

    const result = await syncWatchlistItems(deps)

    expect(result.skippedDueToExclusion).toBe(1)
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it('skips items excluded globally', async () => {
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([movieItem()])
    parts.db.getExclusionMap.mockResolvedValue(
      new Map([['movie-key-1', new Set([SYSTEM_USER_ID])]]),
    )

    const result = await syncWatchlistItems(deps)

    expect(result.skippedDueToExclusion).toBe(1)
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it('skips items missing the id their type needs', async () => {
    parts.db.getAllShowWatchlistItems.mockResolvedValue([
      showItem({ guids: ['tmdb:222'] }),
    ])
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([
      movieItem({ guids: ['tvdb:111'] }),
    ])

    const result = await syncWatchlistItems(deps)

    expect(result.skippedDueToMissingIds).toBe(2)
    expect(routeShow).not.toHaveBeenCalled()
    expect(routeMovie).not.toHaveBeenCalled()
  })

  it.each(ROUTING_SKIP_REASONS)(
    'counts a %s routing decision as skipped',
    async (skippedReason) => {
      vi.mocked(routeShow).mockResolvedValue({ routed: false, skippedReason })
      parts.db.getAllShowWatchlistItems.mockResolvedValue([showItem()])

      const result = await syncWatchlistItems(deps)

      expect(result.skippedDueToRouting).toBe(1)
      expect(result.added.shows).toBe(0)
    },
  )

  it('counts sonarr series that match no watchlist item as unmatched', async () => {
    parts.sonarrManager.fetchAllSeries.mockResolvedValue([
      { title: 'Orphan', type: 'show', guids: ['tvdb:999'] },
    ])
    parts.db.getAllShowWatchlistItems.mockResolvedValue([showItem()])

    const result = await syncWatchlistItems(deps)

    expect(result.unmatched.shows).toBe(1)
  })

  it('keeps counting the other items when one route call throws', async () => {
    vi.mocked(routeMovie).mockRejectedValueOnce(new Error('routing blew up'))
    parts.db.getAllShowWatchlistItems.mockResolvedValue([showItem()])
    parts.db.getAllMovieWatchlistItems.mockResolvedValue([movieItem()])

    const result = await syncWatchlistItems(deps)

    expect(result.added).toEqual({ shows: 1, movies: 0 })
  })

  it('returns the summary even when the status sync fails', async () => {
    parts.statusService.syncAllStatuses.mockRejectedValue(
      new Error('status sync failed'),
    )
    parts.db.getAllShowWatchlistItems.mockResolvedValue([showItem()])

    const result = await syncWatchlistItems(deps)

    expect(result.added.shows).toBe(1)
  })

  it('rethrows when the user lookup fails', async () => {
    parts.db.getAllUsers.mockRejectedValue(new Error('db down'))

    await expect(syncWatchlistItems(deps)).rejects.toThrow('db down')
  })
})
