import type { User } from '@root/types/config.types.js'
import type {
  CachedRssItem,
  EtagPollResult,
  EtagUserInfo,
  Item,
  TokenWatchlistItem,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { StaggeredPollingOptions } from '@services/plex-watchlist/etag/etag-poller.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/plex-watchlist/orchestration/unified-processor.js', () => ({
  processItemsForUser: vi.fn(),
}))

vi.mock('@services/watchlist-workflow/routing/health-checker.js', () => ({
  checkInstanceHealth: vi.fn(async () => ({
    available: true,
    sonarrUnavailable: [],
    radarrUnavailable: [],
    plexServerUnreachable: false,
  })),
  queueForDeferredRouting: vi.fn(() => true),
}))

vi.mock('@services/watchlist-workflow/routing/item-router.js', () => ({
  routeEnrichedItemsForUser: vi.fn(async () => {}),
}))

vi.mock(
  '@services/watchlist-workflow/attribution/approval-attributor.js',
  () => ({
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
  }),
)

vi.mock('@services/watchlist-workflow/rss/enricher.js', () => ({
  enrichRssItems: vi.fn(async (): Promise<Item[]> => []),
}))

import { processItemsForUser } from '@services/plex-watchlist/orchestration/unified-processor.js'
import { checkInstanceHealth } from '@services/watchlist-workflow/routing/health-checker.js'
import { routeEnrichedItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'
import { enrichRssItems } from '@services/watchlist-workflow/rss/enricher.js'
import { processRssFriendsItems } from '@services/watchlist-workflow/rss/friends-processor.js'
import {
  createSafetyNetGate,
  getSafetyNetCycleMs,
  handleSafetyNetPollResult,
  startRssSafetyNet,
  stopRssSafetyNet,
  syncRssSafetyNet,
} from '@services/watchlist-workflow/rss/safety-net.js'

const MINUTE = 60 * 1000
const PRIMARY = createMockUser(1, 'owner', { is_primary_token: true })
const FRIEND = createMockUser(10, 'friend-a')
const USERS = [PRIMARY, FRIEND]

function item(key: string, userId: number): Item {
  return {
    title: `Title ${key}`,
    key,
    type: 'movie',
    guids: ['tmdb:1'],
    genres: [],
    user_id: userId,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function pollResult(
  keys: string[],
  overrides: Partial<EtagPollResult> = {},
): EtagPollResult {
  return {
    changed: keys.length > 0,
    userId: FRIEND.id,
    isPrimary: false,
    newItems: keys.map((id) => ({ id, title: `Title ${id}`, type: 'movie' })),
    ...overrides,
  }
}

/**
 * Stands in for processItemsForUser's DB categorisation: an item already on the
 * user's watchlist is dropped, a new one is returned for routing once.
 */
function useWatchlistStore() {
  const linked = new Set<string>()
  vi.mocked(processItemsForUser).mockImplementation(async (input) => {
    const fresh = input.items.filter(
      (i: TokenWatchlistItem) => !linked.has(`${input.user.userId}:${i.key}`),
    )
    for (const i of fresh) linked.add(`${input.user.userId}:${i.key}`)
    const processed = fresh.map((i) =>
      item(i.key ?? i.id, input.user.userId as number),
    )
    return {
      brandNewCount: processed.length,
      linkedCount: 0,
      processedItems: processed,
      linkedItems: [],
    }
  })
  return linked
}

function createDeps(
  config: Record<string, unknown> = {},
  state: Record<string, unknown> = {},
) {
  const userMap = new Map<string, UserMapEntry>([
    ['uuid-a', { userId: FRIEND.id, username: FRIEND.name }],
  ])
  const deps = createWorkflowDeps({
    db: {
      getUser: vi.fn(
        async (id: number): Promise<User | undefined> =>
          USERS.find((u) => u.id === id),
      ),
      getPrimaryUser: vi.fn(async () => PRIMARY),
    },
    config: {
      plexTokens: ['token'],
      skipIfExistsOnPlex: false,
      rssSafetyNetEnabled: true,
      rssSafetyNetIntervalMinutes: 30,
      ...config,
    },
    state: {
      status: 'running',
      rssMode: true,
      plexUuidCache: userMap,
      deferredRoutingQueue: { enqueue: vi.fn() },
      ...state,
    },
  })
  vi.spyOn(deps.state, 'scheduleDebouncedStatusSync').mockImplementation(
    () => {},
  )
  vi.spyOn(deps.state, 'lookupUserByUuid').mockImplementation(
    async (uuid: string) => userMap.get(uuid)?.userId ?? null,
  )
  return deps
}

describe('getSafetyNetCycleMs', () => {
  it.each([
    [undefined, 30],
    [30, 30],
    [10, 10],
    [5, 10],
    [0, 10],
    [-20, 10],
    [120, 120],
    [600, 120],
    [Number.NaN, 30],
  ])('maps %s minutes to a %s-minute cycle', (minutes, expected) => {
    expect(getSafetyNetCycleMs({ rssSafetyNetIntervalMinutes: minutes })).toBe(
      expected * MINUTE,
    )
  })
})

describe('handleSafetyNetPollResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWatchlistStore()
  })

  it('makes no processing or routing calls when nothing changed', async () => {
    const deps = createDeps()

    await handleSafetyNetPollResult(pollResult([]), deps)

    expect(deps.db.getUser).not.toHaveBeenCalled()
    expect(processItemsForUser).not.toHaveBeenCalled()
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('routes an item the RSS feed missed exactly once and logs it at info', async () => {
    const deps = createDeps()

    await handleSafetyNetPollResult(pollResult(['missed']), deps)

    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)
    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      FRIEND.id,
      [expect.objectContaining({ key: 'missed' })],
      deps,
    )
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: FRIEND.id,
        username: FRIEND.name,
        caught: 1,
        titles: ['Title missed'],
      }),
      'RSS safety net caught watchlist items the RSS feed missed',
    )
  })

  it('does not route or log at info when RSS already delivered every item', async () => {
    const deps = createDeps()
    vi.mocked(processItemsForUser).mockResolvedValueOnce({
      brandNewCount: 0,
      linkedCount: 0,
      processedItems: [],
      linkedItems: [],
    })

    await handleSafetyNetPollResult(pollResult(['seen']), deps)

    expect(processItemsForUser).toHaveBeenCalledTimes(1)
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(deps.logger.info).not.toHaveBeenCalled()
  })

  it('queues caught items for deferred routing while instances are down', async () => {
    const deps = createDeps()
    vi.mocked(checkInstanceHealth).mockResolvedValueOnce({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    await handleSafetyNetPollResult(pollResult(['missed']), deps)

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(deps.state.deferredRoutingQueue?.enqueue).toHaveBeenCalledWith({
      type: 'items',
      userId: FRIEND.id,
      items: [expect.objectContaining({ key: 'missed' })],
    })
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ caught: 1 }),
      'RSS safety net caught watchlist items the RSS feed missed',
    )
  })

  it('does nothing once the run is aborted', async () => {
    const deps = createDeps()
    deps.state.endRun()

    await handleSafetyNetPollResult(pollResult(['missed']), deps)

    expect(processItemsForUser).not.toHaveBeenCalled()
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('drops a result that arrives after a restart opened a new run', async () => {
    const deps = createDeps()
    const armedUnder = deps.state.signal
    deps.state.endRun()
    deps.state.beginRun()

    await handleSafetyNetPollResult(pollResult(['missed']), deps, armedUnder)

    expect(processItemsForUser).not.toHaveBeenCalled()
  })

  it('skips a result for a user that no longer exists', async () => {
    const deps = createDeps()

    await handleSafetyNetPollResult(pollResult(['x'], { userId: 999 }), deps)

    expect(processItemsForUser).not.toHaveBeenCalled()
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  describe('overlap with RSS', () => {
    function friendRss(key: string): CachedRssItem {
      return {
        stableKey: key,
        title: `Title ${key}`,
        type: 'movie',
        guids: ['tmdb:1'],
        genres: [],
        author: 'uuid-a',
      }
    }

    beforeEach(() => {
      vi.mocked(enrichRssItems).mockImplementation(async (items, userId) =>
        items.map((i) => item(i.stableKey, userId)),
      )
    })

    it('does not route again when RSS later delivers an item the safety net caught', async () => {
      const deps = createDeps()

      await handleSafetyNetPollResult(pollResult(['late']), deps)
      await processRssFriendsItems([friendRss('late')], deps)

      expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)
    })

    it('does not route again when the safety net sees an item RSS already delivered', async () => {
      const deps = createDeps()

      await processRssFriendsItems([friendRss('on-time')], deps)
      await handleSafetyNetPollResult(pollResult(['on-time']), deps)

      expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)
      expect(deps.logger.info).not.toHaveBeenCalledWith(
        expect.anything(),
        'RSS safety net caught watchlist items the RSS feed missed',
      )
    })
  })
})

describe('createSafetyNetGate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when the safety net is turned off', async () => {
    const deps = createDeps({ rssSafetyNetEnabled: false })
    const check = vi.fn(async () => {})

    await createSafetyNetGate(deps)(check)

    expect(check).not.toHaveBeenCalled()
  })

  it('skips while a full reconciliation holds the lock', async () => {
    const deps = createDeps({}, { isReconciling: true })
    const check = vi.fn(async () => {})

    await createSafetyNetGate(deps)(check)

    expect(check).not.toHaveBeenCalled()
    expect(deps.state.isReconciling).toBe(true)
  })

  it('skips once the run is aborted', async () => {
    const deps = createDeps()
    deps.state.endRun()
    const check = vi.fn(async () => {})

    await createSafetyNetGate(deps)(check)

    expect(check).not.toHaveBeenCalled()
  })

  it('skips checks of a loop armed under a previous run', async () => {
    const deps = createDeps()
    const gate = createSafetyNetGate(deps, deps.state.signal)
    deps.state.endRun()
    deps.state.beginRun()
    const check = vi.fn(async () => {})

    await gate(check)

    expect(check).not.toHaveBeenCalled()
  })

  it('holds the reconciliation lock and blocks RSS ticks while checking', async () => {
    const deps = createDeps()
    const seen: boolean[] = []

    await createSafetyNetGate(deps)(async () => {
      seen.push(deps.state.isReconciling, deps.state.isSafetyNetChecking)
    })

    expect(seen).toEqual([true, true])
    expect(deps.state.isReconciling).toBe(false)
    expect(deps.state.isSafetyNetChecking).toBe(false)
  })

  it('releases the lock when the check throws', async () => {
    const deps = createDeps()

    await expect(
      createSafetyNetGate(deps)(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(deps.state.isReconciling).toBe(false)
    expect(deps.state.isSafetyNetChecking).toBe(false)
  })

  it('waits for an in-flight RSS check before checking', async () => {
    vi.useFakeTimers()
    const deps = createDeps({}, { rssChecksInFlight: 1 })
    const check = vi.fn(async () => {})

    const gated = createSafetyNetGate(deps)(check)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(check).not.toHaveBeenCalled()

    deps.state.rssChecksInFlight = 0
    await vi.advanceTimersByTimeAsync(250)
    await gated
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('gives up its slot if an RSS check runs for more than 30 seconds', async () => {
    vi.useFakeTimers()
    const deps = createDeps({}, { rssChecksInFlight: 1 })
    const check = vi.fn(async () => {})

    const gated = createSafetyNetGate(deps)(check)
    await vi.advanceTimersByTimeAsync(31_000)
    await gated

    expect(check).not.toHaveBeenCalled()
    expect(deps.state.isReconciling).toBe(false)
  })

  it('skips if a full reconciliation started while it waited for RSS', async () => {
    vi.useFakeTimers()
    const deps = createDeps({}, { rssChecksInFlight: 1 })
    const check = vi.fn(async () => {})

    const gated = createSafetyNetGate(deps)(check)
    await vi.advanceTimersByTimeAsync(500)
    deps.state.isReconciling = true
    deps.state.rssChecksInFlight = 0
    await vi.advanceTimersByTimeAsync(500)
    await gated

    expect(check).not.toHaveBeenCalled()
    expect(deps.state.isReconciling).toBe(true)
  })

  it('stops waiting when the run is aborted', async () => {
    vi.useFakeTimers()
    const deps = createDeps({}, { rssChecksInFlight: 1 })
    const check = vi.fn(async () => {})

    const gated = createSafetyNetGate(deps)(check)
    await vi.advanceTimersByTimeAsync(500)
    deps.state.endRun()
    await vi.advanceTimersByTimeAsync(250)
    await gated

    expect(check).not.toHaveBeenCalled()
  })
})

describe('start, stop and sync', () => {
  function pollerSpy(deps: WorkflowDeps) {
    const poller = deps.state.ensureEtagPoller(() => deps.config, deps.logger)
    const start = vi
      .spyOn(poller, 'startStaggeredPolling')
      .mockImplementation(() => {})
    const stop = vi.spyOn(poller, 'stopStaggeredPolling')
    return { poller, start, stop }
  }

  it('arms the staggered poller with the safety-net cycle, gate and UUID-cache users', async () => {
    const deps = createDeps({ rssSafetyNetIntervalMinutes: 45 })
    const { start } = pollerSpy(deps)

    await expect(startRssSafetyNet(deps)).resolves.toBe(true)

    expect(start).toHaveBeenCalledTimes(1)
    const [primaryId, users, , onCycleStart, options] = start.mock.calls[0] as [
      number,
      EtagUserInfo[],
      unknown,
      () => Promise<EtagUserInfo[]>,
      StaggeredPollingOptions,
    ]
    expect(primaryId).toBe(PRIMARY.id)
    expect(users).toEqual([
      {
        userId: FRIEND.id,
        username: FRIEND.name,
        watchlistId: 'uuid-a',
        isPrimary: false,
      },
    ])
    expect(options.getCycleMs?.()).toBe(45 * MINUTE)
    expect(options.runCheck).toBeTypeOf('function')
    // the friend list comes from the cache, so a cycle start makes no request
    await expect(onCycleStart()).resolves.toEqual(users)
    expect(deps.state.isSafetyNetActive).toBe(true)
  })

  it('does not arm twice', async () => {
    const deps = createDeps()
    const { start } = pollerSpy(deps)

    await startRssSafetyNet(deps)
    await startRssSafetyNet(deps)

    expect(start).toHaveBeenCalledTimes(1)
  })

  it('does nothing when turned off', async () => {
    const deps = createDeps({ rssSafetyNetEnabled: false })
    const { start } = pollerSpy(deps)

    await expect(startRssSafetyNet(deps)).resolves.toBe(false)

    expect(start).not.toHaveBeenCalled()
    expect(deps.db.getPrimaryUser).not.toHaveBeenCalled()
  })

  it('leaves ETag mode alone', async () => {
    const deps = createDeps({}, { rssMode: false })
    const { start } = pollerSpy(deps)

    await expect(startRssSafetyNet(deps)).resolves.toBe(false)
    await syncRssSafetyNet(deps)

    expect(start).not.toHaveBeenCalled()
  })

  it('does not stop the ETag-mode poller when the setting is toggled off', async () => {
    const deps = createDeps({ rssSafetyNetEnabled: false }, { rssMode: false })
    const { stop } = pollerSpy(deps)

    await syncRssSafetyNet(deps)

    expect(stop).not.toHaveBeenCalled()
  })

  it('does not arm once the run is aborted', async () => {
    const deps = createDeps()
    const { start } = pollerSpy(deps)
    vi.mocked(deps.db.getPrimaryUser).mockImplementationOnce(async () => {
      deps.state.endRun()
      return PRIMARY
    })

    await expect(startRssSafetyNet(deps)).resolves.toBe(false)

    expect(start).not.toHaveBeenCalled()
  })

  it('does not arm without a primary user', async () => {
    const deps = createDeps()
    const { start } = pollerSpy(deps)
    vi.mocked(deps.db.getPrimaryUser).mockResolvedValueOnce(undefined)

    await expect(startRssSafetyNet(deps)).resolves.toBe(false)

    expect(start).not.toHaveBeenCalled()
  })

  it('follows the setting when synced after a config change', async () => {
    const deps = createDeps({ rssSafetyNetEnabled: false })
    const { start, stop } = pollerSpy(deps)

    await syncRssSafetyNet(deps)
    expect(start).not.toHaveBeenCalled()

    deps.config.rssSafetyNetEnabled = true
    await syncRssSafetyNet(deps)
    expect(start).toHaveBeenCalledTimes(1)

    deps.config.rssSafetyNetEnabled = false
    await syncRssSafetyNet(deps)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(deps.state.isSafetyNetActive).toBe(false)
  })

  it('does not arm while the workflow is not running', async () => {
    const deps = createDeps({}, { status: 'stopped' })
    const { start } = pollerSpy(deps)

    await syncRssSafetyNet(deps)

    expect(start).not.toHaveBeenCalled()
  })

  it('stop is a no-op when the safety net was never armed', () => {
    const deps = createDeps()
    const { stop } = pollerSpy(deps)

    stopRssSafetyNet(deps)

    expect(stop).not.toHaveBeenCalled()
  })
})

describe('safety net end to end with fake timers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    useWatchlistStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function realPoller(deps: WorkflowDeps) {
    const poller = new EtagPoller(() => deps.config, deps.logger)
    deps.state.etagPoller = poller
    const checked: number[] = []
    let next: Record<number, string[]> = {}
    const checkUser = vi
      .spyOn(poller, 'checkUser')
      .mockImplementation(async (user) => {
        checked.push(user.userId)
        const keys = next[user.userId] ?? []
        next = { ...next, [user.userId]: [] }
        return pollResult(keys, {
          userId: user.userId,
          isPrimary: user.isPrimary,
        })
      })
    return {
      poller,
      checked,
      checkUser,
      setNext: (userId: number, keys: string[]) => {
        next = { ...next, [userId]: keys }
      },
    }
  }

  it('checks each user once per configured interval and routes a missed add once', async () => {
    const deps = createDeps({ rssSafetyNetIntervalMinutes: 30 })
    const { checked, setNext } = realPoller(deps)

    await startRssSafetyNet(deps)
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    // primary at 15 min, friend at 30 min
    expect(checked).toEqual([PRIMARY.id, FRIEND.id])
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()

    setNext(FRIEND.id, ['missed'])
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(checked).toEqual([PRIMARY.id, FRIEND.id, PRIMARY.id, FRIEND.id])
    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)

    // the poller's diff can resurface the same item; it is not routed twice
    setNext(FRIEND.id, ['missed'])
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)

    stopRssSafetyNet(deps)
  })

  it('makes no checks while a full reconciliation is running, then resumes', async () => {
    const deps = createDeps({ rssSafetyNetIntervalMinutes: 30 })
    const { checkUser } = realPoller(deps)
    deps.state.isReconciling = true

    await startRssSafetyNet(deps)
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(checkUser).not.toHaveBeenCalled()

    deps.state.isReconciling = false
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    expect(checkUser).toHaveBeenCalledTimes(2)

    stopRssSafetyNet(deps)
  })

  it('stops checking after stop, even with a check in flight', async () => {
    const deps = createDeps({ rssSafetyNetIntervalMinutes: 30 })
    const { checkUser } = realPoller(deps)

    await startRssSafetyNet(deps)
    await vi.advanceTimersByTimeAsync(15 * MINUTE)
    expect(checkUser).toHaveBeenCalledTimes(1)

    stopRssSafetyNet(deps)
    deps.state.endRun()
    await vi.advanceTimersByTimeAsync(120 * MINUTE)

    expect(checkUser).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('makes no checks once turned off mid-run, even before the poller is stopped', async () => {
    const deps = createDeps({ rssSafetyNetIntervalMinutes: 30 })
    const { checkUser } = realPoller(deps)

    await startRssSafetyNet(deps)
    deps.config.rssSafetyNetEnabled = false
    await vi.advanceTimersByTimeAsync(60 * MINUTE)

    expect(checkUser).not.toHaveBeenCalled()
    stopRssSafetyNet(deps)
  })
})
