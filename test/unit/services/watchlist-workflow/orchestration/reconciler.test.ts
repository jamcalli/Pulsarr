import type {
  EtagPollResult,
  FriendChangesResult,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import type {
  ReconcileDeps,
  ReconcileState,
} from '@services/watchlist-workflow/orchestration/reconciler.js'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

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

vi.mock('@services/watchlist-workflow/routing/index.js', () => ({
  checkInstanceHealth: vi.fn(async () => ({
    available: true,
    sonarrUnavailable: [],
    radarrUnavailable: [],
    plexServerUnreachable: false,
  })),
  queueForDeferredRouting: vi.fn(),
  checkHealthAndQueueIfUnavailable: vi.fn(),
  routeMovie: vi.fn(),
  routeShow: vi.fn(),
  routeEnrichedItemsForUser: vi.fn(),
  routeNewItemsForUser: vi.fn(),
  routeSingleItem: vi.fn(),
  hasUserField: vi.fn(),
}))

vi.mock('@services/watchlist-workflow/orchestration/friend-handler.js', () => ({
  handleNewFriendEtagMode: vi.fn(async () => ({
    success: true,
    itemsRouted: 0,
  })),
  handleNewFriendFullMode: vi.fn(async () => {}),
  handleRemovedFriend: vi.fn(),
}))

import {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
} from '@services/watchlist-workflow/orchestration/friend-handler.js'
import { reconcile } from '@services/watchlist-workflow/orchestration/reconciler.js'
import { checkInstanceHealth } from '@services/watchlist-workflow/routing/index.js'

const PRIMARY_USER = { id: 1, name: 'primary' }

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

function createDeps() {
  const parts = {
    db: {
      getPrimaryUser: vi.fn(
        async (): Promise<{ id: number; name: string } | null> => PRIMARY_USER,
      ),
    },
    plexService: {
      checkFriendChanges: vi.fn(async () => friendChanges()),
    },
    deferredRoutingQueue: { enqueue: vi.fn() },
    fetchWatchlists: vi.fn(async () => {}),
    syncWatchlistItems: vi.fn(async () => {}),
    routeNewItemsForUser: vi.fn(async () => {}),
    routeEnrichedItemsForUser: vi.fn(async () => {}),
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
    scheduleDebouncedStatusSync: vi.fn(),
    updatePlexUuidCache: vi.fn(),
    syncSingleFriend: vi.fn(async () => ({
      brandNewItems: [],
      linkedItems: [],
    })),
    getEtagPoller: vi.fn((): EtagPoller | null => null),
    setEtagPoller: vi.fn(),
  }

  const deps = {
    ...parts,
    logger: createMockLogger(),
    config: { skipIfExistsOnPlex: false },
    fastify: { plexServerService: {} },
    sonarrManager: {},
    radarrManager: {},
    etagPoller: null,
  } as unknown as ReconcileDeps

  return { deps, parts }
}

describe('reconcile', () => {
  let deps: ReconcileDeps
  let parts: ReturnType<typeof createDeps>['parts']
  let state: ReconcileState
  let setState: Mock<(updates: Partial<ReconcileState>) => void>

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
    state = { isReconciling: false, lastSuccessfulSyncTime: 0 }
    setState = vi.fn((updates: Partial<ReconcileState>) => {
      Object.assign(state, updates)
    })
  })

  it('skips etag mode while a reconciliation is already running', async () => {
    state.isReconciling = true

    await reconcile({ mode: 'etag' }, deps, state, setState)

    expect(setState).not.toHaveBeenCalled()
    expect(parts.db.getPrimaryUser).not.toHaveBeenCalled()
    expect(parts.plexService.checkFriendChanges).not.toHaveBeenCalled()
  })

  it('fetches then syncs and establishes baselines in full mode', async () => {
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({
        userMap: new Map([['wl-2', { userId: 2, username: 'friend' }]]),
      }),
    )

    await reconcile({ mode: 'full' }, deps, state, setState)

    expect(parts.fetchWatchlists.mock.invocationCallOrder[0]).toBeLessThan(
      parts.syncWatchlistItems.mock.invocationCallOrder[0],
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
    expect(setState).toHaveBeenCalledWith({ isReconciling: true })
    expect(setState).toHaveBeenCalledWith({
      lastSuccessfulSyncTime: expect.any(Number),
    })
    expect(setState).toHaveBeenLastCalledWith({ isReconciling: false })
  })

  it('returns early when there is no primary user', async () => {
    parts.db.getPrimaryUser.mockResolvedValue(null)

    await reconcile({ mode: 'full' }, deps, state, setState)

    expect(parts.plexService.checkFriendChanges).not.toHaveBeenCalled()
    expect(parts.fetchWatchlists).not.toHaveBeenCalled()
    expect(setState.mock.calls).toEqual([
      [{ isReconciling: true }],
      [{ isReconciling: false }],
    ])
  })

  it('lazily creates the etag poller and hands it back to the service', async () => {
    await reconcile({ mode: 'full' }, deps, state, setState)

    expect(etagPollerMock.EtagPollerCtor).toHaveBeenCalledTimes(1)
    expect(parts.setEtagPoller).toHaveBeenCalledWith(
      etagPollerMock.EtagPollerCtor.mock.instances[0],
    )
  })

  it('reuses an existing etag poller', async () => {
    parts.getEtagPoller.mockReturnValue(
      etagPollerMock.methods as unknown as EtagPoller,
    )

    await reconcile({ mode: 'full' }, deps, state, setState)

    expect(etagPollerMock.EtagPollerCtor).not.toHaveBeenCalled()
    expect(parts.setEtagPoller).not.toHaveBeenCalled()
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

    await reconcile({ mode: 'etag' }, deps, state, setState)

    expect(parts.updatePlexUuidCache).toHaveBeenCalledWith(userMap)
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

    await reconcile({ mode: 'full' }, deps, state, setState)

    expect(vi.mocked(handleNewFriendFullMode).mock.calls[0][0]).toEqual(
      newFriend,
    )
    expect(handleNewFriendEtagMode).not.toHaveBeenCalled()
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

    await reconcile({ mode: 'etag' }, deps, state, setState)

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

    await reconcile({ mode: 'etag' }, deps, state, setState)

    expect(parts.routeNewItemsForUser).toHaveBeenCalledTimes(1)
    expect(parts.routeNewItemsForUser).toHaveBeenCalledWith(withItems)
    expect(parts.updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
    expect(setState).toHaveBeenCalledWith({
      lastSuccessfulSyncTime: expect.any(Number),
    })
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

    await reconcile({ mode: 'etag' }, deps, state, setState)

    expect(parts.deferredRoutingQueue.enqueue).toHaveBeenCalledTimes(1)
    expect(parts.deferredRoutingQueue.enqueue).toHaveBeenCalledWith({
      type: 'etag',
      change: withItems,
    })
    expect(parts.routeNewItemsForUser).not.toHaveBeenCalled()
  })

  it('leaves the last successful sync time untouched when no etag changed', async () => {
    etagPollerMock.methods.checkAllEtags.mockResolvedValue([])

    await reconcile({ mode: 'etag' }, deps, state, setState)

    expect(parts.routeNewItemsForUser).not.toHaveBeenCalled()
    expect(setState.mock.calls).toEqual([
      [{ isReconciling: true }],
      [{ isReconciling: false }],
    ])
  })

  it('propagates friend check failures and still clears the running flag', async () => {
    parts.plexService.checkFriendChanges.mockRejectedValue(
      new Error('plex down'),
    )

    await expect(
      reconcile({ mode: 'etag' }, deps, state, setState),
    ).rejects.toThrow('plex down')

    expect(setState).toHaveBeenLastCalledWith({ isReconciling: false })
    expect(state.isReconciling).toBe(false)
  })
})
