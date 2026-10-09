import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type { Item } from '@root/types/plex.types.js'
import type { WatchlistExclusion } from '@root/types/watchlist-exclusion.types.js'
import type { RateLimitError } from '@services/plex-watchlist/api/helpers.js'
import type {
  FetchLiveWatchlistOptions,
  LiveWatchlistResult,
} from '@services/watchlist-diagnostics/live-fetch.js'
import {
  DIAGNOSTICS_USER_COOLDOWN_MS,
  type DiagnosticsDb,
  WatchlistDiagnosticsError,
  WatchlistDiagnosticsService,
} from '@services/watchlist-diagnostics.service.js'
import { RECONCILIATION_JOB_NAME } from '@services/watchlist-workflow/lifecycle/scheduler.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

const NOW = Date.parse('2026-10-09T12:00:00Z')

const READ_METHODS = [
  'getUser',
  'getAllWatchlistItemsForUser',
  'getAllWatchlistRadarrInstanceJunctions',
  'getAllWatchlistSonarrInstanceJunctions',
  'getAllRadarrInstances',
  'getAllSonarrInstances',
  'getApprovalRequestsByCriteria',
  'getRouterRuleById',
  'getExclusionsForUser',
  'getQuotaStatus',
  'getScheduleByName',
] as const

type StoredRow = Item & { id: number }

interface Fixture {
  user: Partial<User> | null
  items: StoredRow[]
  radarrJunctions: Array<Record<string, unknown>>
  sonarrJunctions: Array<Record<string, unknown>>
  approvals: Array<Partial<ApprovalRequest>>
  userExclusions: Array<Partial<WatchlistExclusion>>
  globalExclusions: Array<Partial<WatchlistExclusion>>
  movieCapExceeded: boolean
}

function row(overrides: Partial<StoredRow> & { id: number; key: string }) {
  return {
    title: `Item ${overrides.id}`,
    type: 'movie',
    user_id: 2,
    status: 'pending',
    guids: ['tmdb:100', 'imdb:tt0000100'],
    genres: [],
    added: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as StoredRow
}

/**
 * Builds a DB double that only answers the allowed read methods. Any other
 * method, which includes every write, is recorded so tests can assert that
 * diagnostics never touched it.
 */
function createDb(fixture: Fixture) {
  const unexpectedCalls: string[] = []
  const reads = {
    getUser: vi.fn(async () =>
      fixture.user
        ? ({
            id: 2,
            name: 'friend',
            can_sync: true,
            requires_approval: false,
            is_primary_token: false,
            plex_uuid: 'friend-uuid',
            apprise: 'mailto://secret@example.com',
            discord_id: '999',
            ...fixture.user,
          } as User)
        : null,
    ),
    getAllWatchlistItemsForUser: vi.fn(async () => fixture.items),
    getAllWatchlistRadarrInstanceJunctions: vi.fn(async (ids: number[]) =>
      fixture.radarrJunctions.filter((j) =>
        ids.includes(j.watchlist_id as number),
      ),
    ),
    getAllWatchlistSonarrInstanceJunctions: vi.fn(async (ids: number[]) =>
      fixture.sonarrJunctions.filter((j) =>
        ids.includes(j.watchlist_id as number),
      ),
    ),
    getAllRadarrInstances: vi.fn(async () => [
      { id: 1, name: 'Radarr Main', apiKey: 'radarr-secret' },
    ]),
    getAllSonarrInstances: vi.fn(async () => [
      { id: 1, name: 'Sonarr Main', apiKey: 'sonarr-secret' },
    ]),
    getApprovalRequestsByCriteria: vi.fn(async () => fixture.approvals),
    getRouterRuleById: vi.fn(async (id: number) =>
      id === 9 ? { id: 9, name: '4K needs approval' } : null,
    ),
    getExclusionsForUser: vi.fn(async (userId: number) =>
      userId === 0 ? fixture.globalExclusions : fixture.userExclusions,
    ),
    getQuotaStatus: vi.fn(async (_userId: number, type: string) =>
      type === 'movie'
        ? {
            quotaType: 'weekly_rolling',
            quotaLimit: 5,
            currentUsage: 6,
            exceeded: true,
            resetDate: null,
            bypassApproval: false,
            watchlistCap: fixture.movieCapExceeded ? 2 : null,
            watchlistUsage: fixture.movieCapExceeded ? 3 : null,
            watchlistCapExceeded: fixture.movieCapExceeded,
          }
        : null,
    ),
    getScheduleByName: vi.fn(async (name: string) =>
      name === RECONCILIATION_JOB_NAME
        ? {
            enabled: true,
            next_run: { time: '2026-10-09T12:30:00Z', status: 'pending' },
          }
        : null,
    ),
  }

  const db = new Proxy(reads, {
    get(target, prop: string) {
      if (prop in target) return target[prop as keyof typeof target]
      if (prop === 'then') return undefined
      return (..._args: unknown[]) => {
        unexpectedCalls.push(prop)
        return Promise.resolve(undefined)
      }
    },
  }) as unknown as DiagnosticsDb

  return { db, reads, unexpectedCalls }
}

function emptyFixture(): Fixture {
  return {
    user: {},
    items: [],
    radarrJunctions: [],
    sonarrJunctions: [],
    approvals: [],
    userExclusions: [],
    globalExclusions: [],
    movieCapExceeded: false,
  }
}

describe('WatchlistDiagnosticsService', () => {
  let now: number
  let fetchLive: ReturnType<
    typeof vi.fn<(o: FetchLiveWatchlistOptions) => Promise<LiveWatchlistResult>>
  >

  function createService(fixture: Fixture, tokens = ['plex-token-secret']) {
    const { db, reads, unexpectedCalls } = createDb(fixture)
    const log = createMockLogger()
    const serviceLog = createMockLogger()
    vi.mocked(log.child).mockReturnValue(serviceLog)
    const service = new WatchlistDiagnosticsService(log, {
      db,
      getPlexTokens: () => tokens,
      getWorkflowStatus: () => ({ status: 'running', rssMode: false }),
      fetchLive,
      now: () => now,
    })
    return { service, reads, unexpectedCalls, log: serviceLog }
  }

  beforeEach(() => {
    now = NOW
    fetchLive = vi.fn(async () => ({
      items: [],
      truncated: false,
      source: 'friend' as const,
    }))
  })

  describe('report', () => {
    it('diffs live and stored items and explains each one', async () => {
      const fixture = emptyFixture()
      fixture.items = [
        row({ id: 1, key: 'routed' }),
        row({ id: 2, key: 'approval' }),
        row({ id: 3, key: 'gone' }),
        row({ id: 4, key: 'no-ids', guids: ['imdb:tt123'] }),
        row({
          id: 5,
          key: 'show',
          type: 'show',
          guids: ['tvdb:55'],
          status: 'notified',
          last_notified_at: '2026-10-02T00:00:00Z',
        }),
      ]
      fixture.radarrJunctions = [
        {
          watchlist_id: 1,
          radarr_instance_id: 1,
          status: 'grabbed',
          is_primary: 1,
          syncing: 0,
          last_notified_at: null,
        },
      ]
      fixture.sonarrJunctions = [
        {
          watchlist_id: 5,
          sonarr_instance_id: 1,
          status: 'notified',
          is_primary: true,
          last_notified_at: '2026-10-03T00:00:00Z',
        },
      ]
      fixture.approvals = [
        {
          id: 11,
          contentKey: 'approval',
          contentType: 'movie',
          contentGuids: ['tmdb:100'],
          status: 'pending',
          triggeredBy: 'router_rule',
          routerRuleId: 9,
          approvalReason: null,
          createdAt: '2026-10-05T00:00:00Z',
        },
      ]
      fetchLive.mockResolvedValue({
        source: 'friend',
        truncated: false,
        items: [
          { key: 'routed', title: 'Routed', type: 'movie' },
          { key: 'approval', title: 'Approval', type: 'movie' },
          { key: 'no-ids', title: 'No IDs', type: 'movie' },
          { key: 'show', title: 'Show', type: 'show' },
          { key: 'new-one', title: 'New One', type: 'movie' },
        ],
      })

      const { service } = createService(fixture)
      const report = await service.run(2)

      const byKey = new Map(report.items.map((item) => [item.key, item]))
      expect(byKey.get('new-one')).toMatchObject({
        presence: 'plex_only',
        state: 'not_seen_yet',
        watchlistItemId: null,
        title: 'New One',
      })
      expect(byKey.get('new-one')?.reason).toContain('~30 min')
      expect(byKey.get('routed')).toMatchObject({
        presence: 'both',
        state: 'routed',
        instances: [
          {
            arr: 'radarr',
            instanceId: 1,
            instanceName: 'Radarr Main',
            status: 'grabbed',
            isPrimary: true,
            syncing: false,
          },
        ],
      })
      expect(byKey.get('approval')).toMatchObject({
        state: 'awaiting_approval',
        approval: { id: 11, ruleName: '4K needs approval' },
      })
      expect(byKey.get('approval')?.reason).toContain('4K needs approval')
      expect(byKey.get('gone')).toMatchObject({
        presence: 'pulsarr_only',
        state: 'removed_from_plex',
      })
      expect(byKey.get('no-ids')).toMatchObject({
        state: 'missing_ids',
        ids: { tmdb: null, tvdb: null, imdb: 'tt123' },
      })
      expect(byKey.get('show')).toMatchObject({
        state: 'routed',
        lastNotifiedAt: '2026-10-03T00:00:00Z',
      })

      expect(report.summary).toEqual({
        onPlex: 5,
        inPulsarr: 5,
        plexOnly: 1,
        pulsarrOnly: 1,
        routed: 2,
        needsAttention: 4,
      })
      expect(report.workflow).toEqual({
        status: 'running',
        rssMode: false,
        nextReconciliationAt: '2026-10-09T12:30:00Z',
      })
      expect(report.live).toEqual({
        source: 'friend',
        itemCount: 5,
        truncated: false,
        maxItems: 1000,
      })
      expect(report.quotas.movie).toMatchObject({ exceeded: true })
      expect(report.quotas.show).toBeNull()
      expect(report.generatedAt).toBe('2026-10-09T12:00:00.000Z')
    })

    it('passes the user identity and page cap to the live fetch', async () => {
      const { service } = createService(emptyFixture(), ['t1', '', 't2'])
      await service.run(2)

      expect(fetchLive).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['t1', 't2'],
          isPrimary: false,
          plexUuid: 'friend-uuid',
          maxPages: 10,
        }),
      )
    })

    it('marks unreached stored items as not checked when the fetch was truncated', async () => {
      const fixture = emptyFixture()
      fixture.items = [row({ id: 1, key: 'beyond-cap' })]
      fetchLive.mockResolvedValue({
        source: 'self',
        truncated: true,
        items: [{ key: 'first-page', title: 'First', type: 'movie' }],
      })

      const { service } = createService(fixture)
      const report = await service.run(2)

      const item = report.items.find((i) => i.key === 'beyond-cap')
      expect(item?.presence).toBe('not_checked')
      expect(item?.state).toBe('not_routed')
      expect(report.summary.pulsarrOnly).toBe(0)
      expect(report.live.truncated).toBe(true)
    })

    it('matches an approval by normalized GUID when the Plex key changed', async () => {
      const fixture = emptyFixture()
      fixture.items = [row({ id: 1, key: 'new-key', guids: ['tmdb://0100'] })]
      fixture.approvals = [
        {
          id: 3,
          contentKey: 'old-key',
          contentType: 'movie',
          contentGuids: ['TMDB:100'],
          status: 'rejected',
          triggeredBy: 'manual_flag',
          routerRuleId: null,
          createdAt: '2026-10-05T00:00:00Z',
        },
        {
          id: 4,
          contentKey: 'other',
          contentType: 'show',
          contentGuids: ['tmdb:100'],
          status: 'pending',
          triggeredBy: 'manual_flag',
          createdAt: '2026-10-04T00:00:00Z',
        },
      ]
      fetchLive.mockResolvedValue({
        source: 'friend',
        truncated: false,
        items: [{ key: 'new-key', title: 'X', type: 'movie' }],
      })

      const { service } = createService(fixture)
      const report = await service.run(2)

      expect(report.items[0]).toMatchObject({
        state: 'approval_rejected',
        approval: { id: 3, ruleName: null },
        guids: ['tmdb:100'],
      })
    })

    it('ranks a global exclusion above a per-user one', async () => {
      const fixture = emptyFixture()
      fixture.items = [row({ id: 1, key: 'k' })]
      fixture.userExclusions = [{ key: 'k', excluded_at: '2026-01-01' }]
      fixture.globalExclusions = [{ key: 'k', excluded_at: '2026-02-01' }]
      fetchLive.mockResolvedValue({
        source: 'friend',
        truncated: false,
        items: [{ key: 'k', title: 'K', type: 'movie' }],
      })

      const { service } = createService(fixture)
      const report = await service.run(2)

      expect(report.items[0]).toMatchObject({
        state: 'excluded_global',
        exclusion: { scope: 'global', excludedAt: '2026-02-01' },
      })
    })

    it('flags pending movies over the watchlist cap', async () => {
      const fixture = emptyFixture()
      fixture.items = [row({ id: 1, key: 'k' })]
      fixture.movieCapExceeded = true
      fetchLive.mockResolvedValue({
        source: 'friend',
        truncated: false,
        items: [{ key: 'k', title: 'K', type: 'movie' }],
      })

      const { service } = createService(fixture)
      const report = await service.run(2)

      expect(report.items[0].state).toBe('watchlist_cap')
    })

    it('falls back to a placeholder name for a disabled instance', async () => {
      const fixture = emptyFixture()
      fixture.items = [row({ id: 1, key: 'k' })]
      fixture.radarrJunctions = [
        {
          watchlist_id: 1,
          radarr_instance_id: 42,
          status: 'requested',
          is_primary: false,
          syncing: true,
          last_notified_at: null,
        },
      ]
      fetchLive.mockResolvedValue({
        source: 'friend',
        truncated: false,
        items: [{ key: 'k', title: 'K', type: 'movie' }],
      })

      const { service } = createService(fixture)
      const report = await service.run(2)

      expect(report.items[0].instances[0]).toMatchObject({
        instanceName: 'Radarr #42',
        syncing: true,
      })
    })

    it('reads junctions in chunks for very large watchlists', async () => {
      const fixture = emptyFixture()
      fixture.items = Array.from({ length: 1_200 }, (_, i) =>
        row({ id: i + 1, key: `k${i}` }),
      )
      const { service, reads } = createService(fixture)

      const report = await service.run(2)

      expect(
        reads.getAllWatchlistRadarrInstanceJunctions,
      ).toHaveBeenCalledTimes(3)
      for (const [ids] of reads.getAllWatchlistRadarrInstanceJunctions.mock
        .calls) {
        expect(ids.length).toBeLessThanOrEqual(500)
      }
      expect(report.items).toHaveLength(1_200)
    })

    it('never exposes tokens, contact details or instance API keys', async () => {
      const fixture = emptyFixture()
      fixture.items = [row({ id: 1, key: 'k' })]
      fixture.radarrJunctions = [
        {
          watchlist_id: 1,
          radarr_instance_id: 1,
          status: 'grabbed',
          is_primary: true,
          syncing: false,
          last_notified_at: null,
        },
      ]
      const { service, log } = createService(fixture)
      const report = await service.run(2)
      const serialized = JSON.stringify(report)

      expect(serialized).not.toContain('plex-token-secret')
      expect(serialized).not.toContain('secret@example.com')
      expect(serialized).not.toContain('radarr-secret')
      expect(serialized).not.toContain('friend-uuid')
      expect(Object.keys(report.user).sort()).toEqual([
        'canSync',
        'id',
        'isPrimary',
        'name',
        'requiresApproval',
      ])
      const logged = JSON.stringify(
        (['debug', 'info', 'warn', 'error'] as const).map(
          (level) => vi.mocked(log[level]).mock.calls,
        ),
      )
      expect(logged).toContain('Watchlist diagnostics completed')
      expect(logged).not.toContain('plex-token-secret')
    })
  })

  describe('read-only guarantee', () => {
    it('calls only the allowed read methods on the database', async () => {
      const fixture = emptyFixture()
      fixture.items = [
        row({ id: 1, key: 'a' }),
        row({ id: 2, key: 'b', guids: [] }),
      ]
      fixture.approvals = [
        {
          id: 1,
          contentKey: 'a',
          contentType: 'movie',
          contentGuids: [],
          status: 'approved',
          triggeredBy: 'router_rule',
          routerRuleId: 9,
          createdAt: '2026-10-05T00:00:00Z',
        },
      ]
      fetchLive.mockResolvedValue({
        source: 'friend',
        truncated: false,
        items: [
          { key: 'a', title: 'A', type: 'movie' },
          { key: 'c', title: 'C', type: 'movie' },
        ],
      })
      const { service, reads, unexpectedCalls } = createService(fixture)

      await service.run(2)

      expect(unexpectedCalls).toEqual([])
      for (const name of READ_METHODS) {
        expect(name in reads).toBe(true)
      }
    })

    it('makes no database calls beyond the user lookup when Plex fails', async () => {
      fetchLive.mockRejectedValue(new Error('boom'))
      const { service, reads, unexpectedCalls } = createService(emptyFixture())

      await expect(service.run(2)).rejects.toMatchObject({
        code: 'plex_unavailable',
        statusCode: 502,
      })
      expect(unexpectedCalls).toEqual([])
      expect(reads.getAllWatchlistItemsForUser).not.toHaveBeenCalled()
    })
  })

  describe('validation', () => {
    it('404s an unknown user without calling Plex', async () => {
      const fixture = emptyFixture()
      fixture.user = null
      const { service } = createService(fixture)

      await expect(service.run(99)).rejects.toMatchObject({
        code: 'user_not_found',
        statusCode: 404,
      })
      expect(fetchLive).not.toHaveBeenCalled()
    })

    it('rejects when no Plex token is configured', async () => {
      const { service } = createService(emptyFixture(), [])
      await expect(service.run(2)).rejects.toMatchObject({
        code: 'not_configured',
        statusCode: 400,
      })
      expect(fetchLive).not.toHaveBeenCalled()
    })

    it('rejects a friend without a Plex UUID', async () => {
      const fixture = emptyFixture()
      fixture.user = { plex_uuid: null }
      const { service } = createService(fixture)
      await expect(service.run(2)).rejects.toMatchObject({
        code: 'not_configured',
      })
      expect(fetchLive).not.toHaveBeenCalled()
    })

    it('allows the primary user without a Plex UUID', async () => {
      const fixture = emptyFixture()
      fixture.user = { plex_uuid: null, is_primary_token: true }
      const { service } = createService(fixture)
      await service.run(2)
      expect(fetchLive).toHaveBeenCalledWith(
        expect.objectContaining({ isPrimary: true }),
      )
    })

    it('maps an exhausted Plex rate limit to 429 with a retry hint', async () => {
      const error = new Error('Rate limit exceeded') as RateLimitError
      error.isRateLimitExhausted = true
      fetchLive.mockRejectedValue(error)
      const { service } = createService(emptyFixture())

      const result = await service.run(2).catch((e: unknown) => e)
      expect(result).toBeInstanceOf(WatchlistDiagnosticsError)
      expect(result).toMatchObject({
        code: 'plex_rate_limited',
        statusCode: 429,
        retryAfterSeconds: 60,
      })
    })

    it('rethrows the abort reason untouched when the caller aborts', async () => {
      const controller = new AbortController()
      const reason = new Error('client disconnected')
      fetchLive.mockImplementation(async () => {
        controller.abort(reason)
        throw reason
      })
      const { service } = createService(emptyFixture())

      await expect(service.run(2, controller.signal)).rejects.toBe(reason)
    })
  })

  describe('rate limiting', () => {
    it('allows one run per user per cooldown window', async () => {
      const { service } = createService(emptyFixture())

      await service.run(2)
      now += DIAGNOSTICS_USER_COOLDOWN_MS - 1_500

      const blocked = await service.run(2).catch((e: unknown) => e)
      expect(blocked).toMatchObject({
        code: 'cooldown',
        statusCode: 429,
        retryAfterSeconds: 2,
      })
      expect(fetchLive).toHaveBeenCalledTimes(1)

      now += 1_500
      await service.run(2)
      expect(fetchLive).toHaveBeenCalledTimes(2)
    })

    it('counts a failed run against the cooldown', async () => {
      fetchLive.mockRejectedValueOnce(new Error('boom'))
      const { service } = createService(emptyFixture())

      await expect(service.run(2)).rejects.toMatchObject({
        code: 'plex_unavailable',
      })
      await expect(service.run(2)).rejects.toMatchObject({ code: 'cooldown' })
      expect(fetchLive).toHaveBeenCalledTimes(1)
    })

    it('does not charge the cooldown for a rejected request', async () => {
      const fixture = emptyFixture()
      fixture.user = null
      const { service } = createService(fixture)

      await expect(service.run(2)).rejects.toMatchObject({
        code: 'user_not_found',
      })
      fixture.user = {}
      await service.run(2)
      expect(fetchLive).toHaveBeenCalledTimes(1)
    })

    it('tracks the cooldown per user', async () => {
      const { service } = createService(emptyFixture())
      await service.run(2)
      await service.run(3)
      expect(fetchLive).toHaveBeenCalledTimes(2)
    })

    it('runs one diagnostic at a time across all users', async () => {
      let release: () => void = () => {}
      fetchLive.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({ items: [], truncated: false, source: 'friend' })
          }),
      )
      const { service } = createService(emptyFixture())

      const first = service.run(2)
      await vi.waitFor(() => expect(fetchLive).toHaveBeenCalledTimes(1))

      await expect(service.run(3)).rejects.toMatchObject({
        code: 'busy',
        statusCode: 429,
      })

      release()
      await first
      await service.run(3)
      expect(fetchLive).toHaveBeenCalledTimes(2)
    })
  })
})
