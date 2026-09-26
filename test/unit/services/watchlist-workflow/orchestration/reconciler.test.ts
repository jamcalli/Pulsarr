import type { User } from '@root/types/config.types.js'
import type {
  EtagPollResult,
  FriendChangesResult,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import {
  createWorkflowDeps,
  type WorkflowDepsOverrides,
} from '../../../../mocks/watchlist-workflow-deps.js'

const etagPollerMock = vi.hoisted(() => {
  const methods = {
    establishAllBaselines: vi.fn(async () => {}),
    checkAllEtags: vi.fn(async (): Promise<EtagPollResult[]> => []),
    establishBaseline: vi.fn(async () => {}),
    invalidateUser: vi.fn(),
  }
  const EtagPollerCtor = vi.fn(
    class {
      establishAllBaselines = methods.establishAllBaselines
      checkAllEtags = methods.checkAllEtags
      establishBaseline = methods.establishBaseline
      invalidateUser = methods.invalidateUser
    },
  )
  return { methods, EtagPollerCtor }
})

vi.mock('@services/plex-watchlist/etag/etag-poller.js', () => ({
  EtagPoller: etagPollerMock.EtagPollerCtor,
}))

vi.mock('@services/watchlist-workflow/routing/health-checker.js', () => ({
  checkInstanceHealth: vi.fn(async () => ({
    available: true,
    sonarrUnavailable: [],
    radarrUnavailable: [],
    plexServerUnreachable: false,
  })),
}))

vi.mock('@services/watchlist-workflow/routing/item-router.js', () => ({
  routeNewItemsForUser: vi.fn(async () => {}),
}))

vi.mock(
  '@services/watchlist-workflow/attribution/approval-attributor.js',
  () => ({
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
  }),
)

vi.mock('@services/watchlist-workflow/fetching/watchlist-fetcher.js', () => ({
  fetchWatchlists: vi.fn(async () => {}),
}))

vi.mock('@services/watchlist-workflow/orchestration/sync-engine.js', () => ({
  syncWatchlistItems: vi.fn(async () => {}),
}))

vi.mock('@services/watchlist-workflow/orchestration/friend-handler.js', () => ({
  handleNewFriendEtagMode: vi.fn(async () => ({
    success: true,
    itemsRouted: 0,
  })),
  handleNewFriendFullMode: vi.fn(async () => {}),
  handleRemovedFriend: vi.fn(),
}))

import { updateAutoApprovalUserAttribution } from '@services/watchlist-workflow/attribution/approval-attributor.js'
import { fetchWatchlists } from '@services/watchlist-workflow/fetching/watchlist-fetcher.js'
import {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
} from '@services/watchlist-workflow/orchestration/friend-handler.js'
import { reconcile } from '@services/watchlist-workflow/orchestration/reconciler.js'
import { syncWatchlistItems } from '@services/watchlist-workflow/orchestration/sync-engine.js'
import { checkInstanceHealth } from '@services/watchlist-workflow/routing/health-checker.js'
import { routeNewItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'

const PRIMARY_USER = createMockUser(1, 'primary')

function friendChanges(
  overrides: Partial<FriendChangesResult> = {},
): FriendChangesResult {
  return {
    added: [],
    removed: [],
    userMap: new Map<string, UserMapEntry>(),
    ...overrides,
  }
}

function etagResult(overrides: Partial<EtagPollResult> = {}): EtagPollResult {
  return {
    changed: true,
    userId: 1,
    isPrimary: true,
    newItems: [{ id: 'k1', title: 'Item', type: 'movie' }],
    ...overrides,
  }
}

function createDeps(stateOverrides: WorkflowDepsOverrides['state'] = {}) {
  const enqueue = vi.fn()
  const services = {
    db: {
      getPrimaryUser: vi.fn(
        async (): Promise<User | undefined> => PRIMARY_USER,
      ),
    },
    plexService: {
      checkFriendChanges: vi.fn(async () => friendChanges()),
    },
  }

  const deps = createWorkflowDeps({
    ...services,
    config: { skipIfExistsOnPlex: false },
    state: {
      lastSuccessfulSyncTime: 0,
      deferredRoutingQueue: { enqueue },
      ...stateOverrides,
    },
  })
  const state = deps.state

  const parts = {
    ...services,
    enqueue,
    scheduleDebouncedStatusSync: vi
      .spyOn(state, 'scheduleDebouncedStatusSync')
      .mockImplementation(() => {}),
    updatePlexUuidCache: vi.spyOn(state, 'updatePlexUuidCache'),
  }

  return { deps, parts, state }
}

describe('reconcile', () => {
  let deps: WorkflowDeps
  let parts: ReturnType<typeof createDeps>['parts']
  let state: WorkflowState

  beforeEach(() => {
    vi.clearAllMocks()
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([])
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    const created = createDeps()
    deps = created.deps
    parts = created.parts
    state = created.state
  })

  it('skips etag mode while a reconciliation is already running', async () => {
    state.isReconciling = true

    await reconcile({ mode: 'etag' }, deps)

    expect(state.isReconciling).toBe(true)
    expect(parts.db.getPrimaryUser).not.toHaveBeenCalled()
    expect(parts.plexService.checkFriendChanges).not.toHaveBeenCalled()
  })

  it('fetches then syncs and establishes baselines in full mode', async () => {
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({
        userMap: new Map([['wl-2', { userId: 2, username: 'friend' }]]),
      }),
    )

    await reconcile({ mode: 'full' }, deps)

    expect(vi.mocked(fetchWatchlists).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(syncWatchlistItems).mock.invocationCallOrder[0],
    )
    expect(etagPollerMock.methods.establishAllBaselines).toHaveBeenCalledWith(
      PRIMARY_USER.id,
      [
        {
          userId: 2,
          username: 'friend',
          watchlistId: 'wl-2',
          isPrimary: false,
        },
      ],
    )
    expect(state.lastSuccessfulSyncTime).toBeGreaterThan(0)
    expect(state.isReconciling).toBe(false)
  })

  it('stops a full sync before routing when the run is aborted mid-fetch', async () => {
    vi.mocked(fetchWatchlists).mockImplementationOnce(async () => {
      state.endRun()
    })

    await reconcile({ mode: 'full' }, deps)

    expect(syncWatchlistItems).not.toHaveBeenCalled()
    expect(etagPollerMock.methods.establishAllBaselines).not.toHaveBeenCalled()
    expect(state.lastSuccessfulSyncTime).toBe(0)
    expect(state.isReconciling).toBe(false)
  })

  it('stays cancelled when a new run opens before the aborted sync resumes', async () => {
    vi.mocked(fetchWatchlists).mockImplementationOnce(async () => {
      state.endRun()
      state.beginRun()
    })

    await reconcile({ mode: 'full' }, deps)

    expect(syncWatchlistItems).not.toHaveBeenCalled()
    expect(state.lastSuccessfulSyncTime).toBe(0)
    expect(state.isReconciling).toBe(false)
  })

  it('returns early when there is no primary user', async () => {
    parts.db.getPrimaryUser.mockResolvedValue(undefined)

    await reconcile({ mode: 'full' }, deps)

    expect(parts.plexService.checkFriendChanges).not.toHaveBeenCalled()
    expect(fetchWatchlists).not.toHaveBeenCalled()
    expect(state.lastSuccessfulSyncTime).toBe(0)
    expect(state.isReconciling).toBe(false)
  })

  it('lazily creates the etag poller and hands it back to the service', async () => {
    await reconcile({ mode: 'full' }, deps)

    expect(etagPollerMock.EtagPollerCtor).toHaveBeenCalledTimes(1)
    expect(state.etagPoller).toBe(
      etagPollerMock.EtagPollerCtor.mock.instances[0],
    )
  })

  it('reuses an existing etag poller', async () => {
    const existing = createDeps({ etagPoller: etagPollerMock.methods })

    await reconcile({ mode: 'full' }, existing.deps)

    expect(etagPollerMock.EtagPollerCtor).not.toHaveBeenCalled()
    expect(existing.state.etagPoller).toBe(etagPollerMock.methods)
    expect(etagPollerMock.methods.establishAllBaselines).toHaveBeenCalledTimes(
      1,
    )
  })

  it('routes added friends to the etag handler and updates the uuid cache', async () => {
    const newFriend = {
      userId: 5,
      username: 'new-friend',
      watchlistId: 'wl-5',
      isPrimary: false,
    }
    const userMap = new Map([['wl-5', { userId: 5, username: 'new-friend' }]])
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [newFriend], userMap }),
    )

    await reconcile({ mode: 'etag' }, deps)

    expect(parts.updatePlexUuidCache).toHaveBeenCalledWith(userMap, deps.logger)
    expect(handleNewFriendEtagMode).toHaveBeenCalledTimes(1)
    expect(vi.mocked(handleNewFriendEtagMode).mock.calls[0][0]).toEqual(
      newFriend,
    )
    expect(handleNewFriendFullMode).not.toHaveBeenCalled()
  })

  it('routes added friends to the full handler in full mode', async () => {
    const newFriend = {
      userId: 5,
      username: 'new-friend',
      watchlistId: 'wl-5',
      isPrimary: false,
    }
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [newFriend] }),
    )

    await reconcile({ mode: 'full' }, deps)

    expect(vi.mocked(handleNewFriendFullMode).mock.calls[0][0]).toEqual(
      newFriend,
    )
    expect(handleNewFriendEtagMode).not.toHaveBeenCalled()
  })

  it('stops handling added friends once the run ends', async () => {
    const friend = (userId: number) => ({
      userId,
      username: `friend-${userId}`,
      watchlistId: `wl-${userId}`,
      isPrimary: false,
    })
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [friend(5), friend(6)] }),
    )
    vi.mocked(handleNewFriendEtagMode).mockImplementationOnce(async () => {
      state.endRun()
      return { success: false, itemsRouted: 0 }
    })

    await reconcile({ mode: 'etag' }, deps)

    expect(handleNewFriendEtagMode).toHaveBeenCalledTimes(1)
    expect(etagPollerMock.methods.checkAllEtags).not.toHaveBeenCalled()
  })

  it('passes removed friends to the removal handler', async () => {
    const removedFriend = {
      userId: 6,
      username: 'gone',
      watchlistId: 'wl-6',
      isPrimary: false,
    }
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ removed: [removedFriend] }),
    )

    await reconcile({ mode: 'etag' }, deps)

    expect(vi.mocked(handleRemovedFriend).mock.calls[0][0]).toEqual(
      removedFriend,
    )
  })

  it('routes only etag changes that carry new items', async () => {
    const withItems = etagResult()
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([
      withItems,
      etagResult({ userId: 2, isPrimary: false, newItems: [] }),
    ])

    await reconcile({ mode: 'etag' }, deps)

    expect(routeNewItemsForUser).toHaveBeenCalledTimes(1)
    expect(vi.mocked(routeNewItemsForUser).mock.calls[0][0]).toBe(withItems)
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
    expect(state.lastSuccessfulSyncTime).toBeGreaterThan(0)
  })

  it('queues etag changes for deferred routing when instances are unavailable', async () => {
    const withItems = etagResult()
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([
      withItems,
      etagResult({ userId: 2, isPrimary: false, newItems: [] }),
    ])
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    await reconcile({ mode: 'etag' }, deps)

    expect(parts.enqueue).toHaveBeenCalledTimes(1)
    expect(parts.enqueue).toHaveBeenCalledWith({
      type: 'etag',
      change: withItems,
    })
    expect(routeNewItemsForUser).not.toHaveBeenCalled()
  })

  it('neither routes nor queues etag changes when a new run opens during the health check', async () => {
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([etagResult()])
    vi.mocked(checkInstanceHealth).mockImplementationOnce(async () => {
      state.endRun()
      state.beginRun()
      return {
        available: false,
        sonarrUnavailable: [1],
        radarrUnavailable: [],
        plexServerUnreachable: false,
      }
    })

    await reconcile({ mode: 'etag' }, deps)

    expect(parts.enqueue).not.toHaveBeenCalled()
    expect(routeNewItemsForUser).not.toHaveBeenCalled()
  })

  it('stops routing etag changes and skips follow-ups when the run ends mid-route', async () => {
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([
      etagResult(),
      etagResult({ userId: 2, isPrimary: false }),
    ])
    vi.mocked(routeNewItemsForUser).mockImplementationOnce(async () => {
      state.endRun()
    })

    await reconcile({ mode: 'etag' }, deps)

    expect(routeNewItemsForUser).toHaveBeenCalledTimes(1)
    expect(updateAutoApprovalUserAttribution).not.toHaveBeenCalled()
    expect(parts.scheduleDebouncedStatusSync).not.toHaveBeenCalled()
    expect(state.lastSuccessfulSyncTime).toBe(0)
  })

  it('leaves the last successful sync time untouched when no etag changed', async () => {
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([])

    await reconcile({ mode: 'etag' }, deps)

    expect(routeNewItemsForUser).not.toHaveBeenCalled()
    expect(state.lastSuccessfulSyncTime).toBe(0)
    expect(state.isReconciling).toBe(false)
  })

  it('propagates friend check failures and still clears the running flag', async () => {
    parts.plexService.checkFriendChanges.mockRejectedValue(
      new Error('plex down'),
    )

    await expect(reconcile({ mode: 'etag' }, deps)).rejects.toThrow('plex down')

    expect(state.isReconciling).toBe(false)
  })
})
