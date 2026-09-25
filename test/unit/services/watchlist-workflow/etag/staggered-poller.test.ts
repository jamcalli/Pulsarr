import type { User } from '@root/types/config.types.js'
import type {
  EtagPollResult,
  FriendChangesResult,
  Item,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/plex-watchlist/index.js', () => ({
  processItemsForUser: vi.fn(async () => ({
    brandNewCount: 0,
    linkedCount: 0,
    processedItems: [],
    linkedItems: [],
  })),
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

vi.mock('@services/watchlist-workflow/orchestration/friend-handler.js', () => ({
  syncSingleFriend: vi.fn(
    async (): Promise<{ brandNewItems: Item[]; linkedItems: Item[] }> => ({
      brandNewItems: [],
      linkedItems: [],
    }),
  ),
}))

import { processItemsForUser } from '@services/plex-watchlist/index.js'
import { updateAutoApprovalUserAttribution } from '@services/watchlist-workflow/attribution/approval-attributor.js'
import {
  handleStaggeredPollResult,
  refreshFriendsForStaggeredPolling,
} from '@services/watchlist-workflow/etag/staggered-poller.js'
import { syncSingleFriend } from '@services/watchlist-workflow/orchestration/friend-handler.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '@services/watchlist-workflow/routing/health-checker.js'
import { routeEnrichedItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'

const USER = createMockUser(9, 'poll-user')

function pollResult(overrides: Partial<EtagPollResult> = {}): EtagPollResult {
  return {
    changed: true,
    userId: USER.id,
    isPrimary: false,
    newItems: [{ id: 'rk-1', title: 'New Item', type: 'movie' }],
    ...overrides,
  }
}

function enrichedItem(key: string): Item {
  return {
    title: key,
    key,
    type: 'movie',
    guids: ['tmdb:1'],
    genres: [],
    user_id: USER.id,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function processedResult(processed: Item[], linked: Item[]) {
  return {
    brandNewCount: processed.length,
    linkedCount: linked.length,
    processedItems: processed,
    linkedItems: linked,
  }
}

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

function createDeps() {
  const etagPoller = {
    establishBaseline: vi.fn(async () => {}),
    invalidateUser: vi.fn(),
  }
  const enqueue = vi.fn()

  const services = {
    db: {
      getUser: vi.fn(async (): Promise<User | undefined> => USER),
    },
    plexService: {
      checkFriendChanges: vi.fn(async () => friendChanges()),
    },
  }

  const deps = createWorkflowDeps({
    ...services,
    config: { skipIfExistsOnPlex: false },
    state: { etagPoller, deferredRoutingQueue: { enqueue } },
  })
  const state = deps.state

  const parts = {
    ...services,
    etagPoller,
    enqueue,
    scheduleDebouncedStatusSync: vi
      .spyOn(state, 'scheduleDebouncedStatusSync')
      .mockImplementation(() => {}),
    updatePlexUuidCache: vi.spyOn(state, 'updatePlexUuidCache'),
  }

  return { deps, parts, state }
}

describe('handleStaggeredPollResult', () => {
  let deps: WorkflowDeps
  let parts: ReturnType<typeof createDeps>['parts']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })
    vi.mocked(processItemsForUser).mockResolvedValue(processedResult([], []))

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it.each([
    ['unchanged', pollResult({ changed: false })],
    ['empty', pollResult({ newItems: [] })],
  ])('ignores a %s poll result', async (_label, result) => {
    await handleStaggeredPollResult(result, deps)

    expect(parts.db.getUser).not.toHaveBeenCalled()
    expect(processItemsForUser).not.toHaveBeenCalled()
  })

  it('stops when the user is not in the database', async () => {
    parts.db.getUser.mockResolvedValue(undefined)

    await handleStaggeredPollResult(pollResult(), deps)

    expect(processItemsForUser).not.toHaveBeenCalled()
  })

  it('processes and routes new items when instances are available', async () => {
    const processed = enrichedItem('processed')
    const linked = enrichedItem('linked')
    vi.mocked(processItemsForUser).mockResolvedValue(
      processedResult([processed], [linked]),
    )

    await handleStaggeredPollResult(pollResult({ isPrimary: true }), deps)

    expect(vi.mocked(processItemsForUser).mock.calls[0][0]).toEqual({
      user: { userId: USER.id, username: USER.name, watchlistId: '' },
      items: [
        expect.objectContaining({
          id: 'rk-1',
          key: 'rk-1',
          title: 'New Item',
          type: 'movie',
          user_id: USER.id,
          status: 'pending',
        }),
      ],
      isSelfWatchlist: true,
    })
    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      USER.id,
      [processed, linked],
      deps,
    )
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
  })

  it('persists then queues when instances are unavailable', async () => {
    const processed = enrichedItem('processed')
    const linked = enrichedItem('linked')
    vi.mocked(processItemsForUser).mockResolvedValue(
      processedResult([processed], [linked]),
    )
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    await handleStaggeredPollResult(pollResult(), deps)

    expect(processItemsForUser).toHaveBeenCalledTimes(1)
    expect(parts.enqueue).toHaveBeenCalledWith({
      type: 'items',
      userId: USER.id,
      items: [processed, linked],
    })
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
  })

  it('routes anyway when instances are unavailable and no queue exists', async () => {
    const processed = enrichedItem('processed')
    vi.mocked(processItemsForUser).mockResolvedValue(
      processedResult([processed], []),
    )
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })
    deps.state.deferredRoutingQueue = null

    await handleStaggeredPollResult(pollResult(), deps)

    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      USER.id,
      [processed],
      deps,
    )
  })

  it('neither routes nor queues when processing yields nothing', async () => {
    await handleStaggeredPollResult(pollResult(), deps)

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.enqueue).not.toHaveBeenCalled()
  })

  it('persists but neither routes nor queues when the run ends during processing', async () => {
    vi.mocked(processItemsForUser).mockImplementation(async () => {
      deps.state.endRun()
      return processedResult([enrichedItem('processed')], [])
    })

    await handleStaggeredPollResult(pollResult(), deps)

    expect(processItemsForUser).toHaveBeenCalledTimes(1)
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.enqueue).not.toHaveBeenCalled()
  })

  it('stays cancelled when a new run opens during processing', async () => {
    vi.mocked(processItemsForUser).mockImplementation(async () => {
      deps.state.endRun()
      deps.state.beginRun()
      return processedResult([enrichedItem('processed')], [])
    })

    await handleStaggeredPollResult(pollResult(), deps)

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.enqueue).not.toHaveBeenCalled()
  })
})

describe('refreshFriendsForStaggeredPolling', () => {
  let deps: WorkflowDeps
  let parts: ReturnType<typeof createDeps>['parts']
  let state: WorkflowState

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })
    vi.mocked(syncSingleFriend).mockResolvedValue({
      brandNewItems: [enrichedItem('brand-new')],
      linkedItems: [enrichedItem('linked')],
    })

    const created = createDeps()
    deps = created.deps
    parts = created.parts
    state = created.state
  })

  it('returns the current friends when nothing changed', async () => {
    const userMap = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
    ])
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ userMap }),
    )

    const friends = await refreshFriendsForStaggeredPolling(deps)

    expect(parts.updatePlexUuidCache).toHaveBeenCalledWith(userMap, deps.logger)
    expect(friends).toEqual([
      {
        userId: 9,
        username: 'poll-user',
        watchlistId: 'wl-9',
        isPrimary: false,
      },
    ])
    expect(state.plexUuidCache).toEqual(userMap)
    expect(state.plexUuidCache).not.toBe(userMap)
  })

  it('syncs and routes a newly added friend', async () => {
    const newFriend = {
      userId: 11,
      username: 'new-friend',
      watchlistId: 'wl-11',
      isPrimary: false,
    }
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [newFriend] }),
    )

    await refreshFriendsForStaggeredPolling(deps)

    expect(vi.mocked(syncSingleFriend).mock.calls[0][0]).toEqual({
      userId: 11,
      username: 'new-friend',
      isPrimary: false,
      watchlistId: 'wl-11',
    })
    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      11,
      [enrichedItem('brand-new'), enrichedItem('linked')],
      deps,
    )
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith({
      userId: 11,
      username: 'new-friend',
      isPrimary: false,
      watchlistId: 'wl-11',
    })
  })

  it('queues a newly added friend when instances are unavailable', async () => {
    const newFriend = {
      userId: 11,
      username: 'new-friend',
      watchlistId: 'wl-11',
      isPrimary: false,
    }
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [newFriend] }),
    )
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: false,
      sonarrUnavailable: [1],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    await refreshFriendsForStaggeredPolling(deps)

    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][1]).toEqual({
      type: 'items',
      userId: 11,
      items: [enrichedItem('brand-new'), enrichedItem('linked')],
    })
    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][2]).toBe(
      'staggered-new-friend',
    )
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledTimes(1)
  })

  it('continues when syncing a new friend fails', async () => {
    const newFriend = {
      userId: 11,
      username: 'new-friend',
      watchlistId: 'wl-11',
      isPrimary: false,
    }
    const userMap = new Map<string, UserMapEntry>([
      ['wl-11', { userId: 11, username: 'new-friend' }],
    ])
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [newFriend], userMap }),
    )
    vi.mocked(syncSingleFriend).mockRejectedValue(
      new Error('friend sync failed'),
    )

    const friends = await refreshFriendsForStaggeredPolling(deps)

    expect(parts.etagPoller.establishBaseline).not.toHaveBeenCalled()
    expect(friends).toEqual([
      {
        userId: 11,
        username: 'new-friend',
        watchlistId: 'wl-11',
        isPrimary: false,
      },
    ])
  })

  it('drops a removed friend from the cache and the rotation', async () => {
    const removed = {
      userId: 11,
      username: 'gone',
      watchlistId: 'wl-11',
      isPrimary: false,
    }
    const userMap = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
      ['wl-11', { userId: 11, username: 'gone' }],
    ])
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ removed: [removed], userMap }),
    )

    const friends = await refreshFriendsForStaggeredPolling(deps)

    expect(parts.etagPoller.invalidateUser).toHaveBeenCalledWith(11, 'wl-11')
    expect(state.plexUuidCache.has('wl-11')).toBe(false)
    expect(friends.map((friend) => friend.userId)).toEqual([9])
  })

  it('keeps the cache and returns the current friends when the run ends during the friend check', async () => {
    const cache = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
    ])
    state.plexUuidCache = cache
    parts.plexService.checkFriendChanges.mockImplementation(async () => {
      state.endRun()
      return friendChanges({
        userMap: new Map<string, UserMapEntry>([
          ['wl-77', { userId: 77, username: 'late-friend' }],
        ]),
      })
    })

    const friends = await refreshFriendsForStaggeredPolling(deps)

    expect(parts.updatePlexUuidCache).not.toHaveBeenCalled()
    expect(state.plexUuidCache).toBe(cache)
    expect(friends).toEqual([
      {
        userId: 9,
        username: 'poll-user',
        watchlistId: 'wl-9',
        isPrimary: false,
      },
    ])
  })

  it('keeps the cache when a new run opens during the friend check', async () => {
    const cache = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
    ])
    state.plexUuidCache = cache
    parts.plexService.checkFriendChanges.mockImplementation(async () => {
      state.endRun()
      state.beginRun()
      return friendChanges({
        userMap: new Map<string, UserMapEntry>([
          ['wl-77', { userId: 77, username: 'late-friend' }],
        ]),
      })
    })

    await refreshFriendsForStaggeredPolling(deps)

    expect(parts.updatePlexUuidCache).not.toHaveBeenCalled()
    expect(state.plexUuidCache).toBe(cache)
    expect(syncSingleFriend).not.toHaveBeenCalled()
  })

  it('stops before routing when the run ends while syncing a new friend', async () => {
    const newFriend = {
      userId: 11,
      username: 'new-friend',
      watchlistId: 'wl-11',
      isPrimary: false,
    }
    const userMap = new Map<string, UserMapEntry>([
      ['wl-11', { userId: 11, username: 'new-friend' }],
    ])
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ added: [newFriend], userMap }),
    )
    vi.mocked(syncSingleFriend).mockImplementation(async () => {
      state.endRun()
      return { brandNewItems: [enrichedItem('brand-new')], linkedItems: [] }
    })

    const friends = await refreshFriendsForStaggeredPolling(deps)

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(queueForDeferredRouting).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).not.toHaveBeenCalled()
    expect(friends).toEqual([
      {
        userId: 11,
        username: 'new-friend',
        watchlistId: 'wl-11',
        isPrimary: false,
      },
    ])
  })

  it('falls back to the supplied cache when the friend check fails', async () => {
    const cache = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
    ])
    state.plexUuidCache = cache
    parts.plexService.checkFriendChanges.mockRejectedValue(
      new Error('plex down'),
    )

    const friends = await refreshFriendsForStaggeredPolling(deps)

    expect(state.plexUuidCache).toBe(cache)
    expect(friends).toEqual([
      {
        userId: 9,
        username: 'poll-user',
        watchlistId: 'wl-9',
        isPrimary: false,
      },
    ])
  })
})
