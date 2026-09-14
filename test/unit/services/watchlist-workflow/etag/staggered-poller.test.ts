import type {
  EtagPollResult,
  FriendChangesResult,
  Item,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { StaggeredPollerDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

vi.mock('@services/plex-watchlist/index.js', () => ({
  processItemsForUser: vi.fn(async () => ({
    brandNewCount: 0,
    linkedCount: 0,
    processedItems: [],
    linkedItems: [],
  })),
}))

vi.mock('@services/watchlist-workflow/routing/index.js', () => ({
  checkInstanceHealth: vi.fn(async () => ({
    available: true,
    sonarrUnavailable: [],
    radarrUnavailable: [],
    plexServerUnreachable: false,
  })),
  queueForDeferredRouting: vi.fn(() => true),
  checkHealthAndQueueIfUnavailable: vi.fn(),
  routeMovie: vi.fn(),
  routeShow: vi.fn(),
  routeEnrichedItemsForUser: vi.fn(),
  routeNewItemsForUser: vi.fn(),
  routeSingleItem: vi.fn(),
  hasUserField: vi.fn(),
}))

import { processItemsForUser } from '@services/plex-watchlist/index.js'
import {
  handleStaggeredPollResult,
  refreshFriendsForStaggeredPolling,
} from '@services/watchlist-workflow/etag/staggered-poller.js'
import {
  checkInstanceHealth,
  queueForDeferredRouting,
} from '@services/watchlist-workflow/routing/index.js'

const USER = { id: 9, name: 'poll-user' }

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
  const parts = {
    db: {
      getUser: vi.fn(
        async (): Promise<{ id: number; name: string } | undefined> => USER,
      ),
    },
    plexService: {
      checkFriendChanges: vi.fn(async () => friendChanges()),
    },
    etagPoller: {
      establishBaseline: vi.fn(async () => {}),
      invalidateUser: vi.fn(),
    },
    deferredRoutingQueue: { enqueue: vi.fn() },
    routeEnrichedItemsForUser: vi.fn(async () => {}),
    syncSingleFriend: vi.fn(
      async (): Promise<{ brandNewItems: Item[]; linkedItems: Item[] }> => ({
        brandNewItems: [enrichedItem('brand-new')],
        linkedItems: [enrichedItem('linked')],
      }),
    ),
    updatePlexUuidCache: vi.fn(),
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
    scheduleDebouncedStatusSync: vi.fn(),
  }

  const deps = {
    ...parts,
    logger: createMockLogger(),
    config: { skipIfExistsOnPlex: false },
    fastify: { plexServerService: {} },
    sonarrManager: {},
    radarrManager: {},
    itemProcessorDeps: {},
  } as unknown as StaggeredPollerDeps

  return { deps, parts }
}

describe('handleStaggeredPollResult', () => {
  let deps: StaggeredPollerDeps
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
    expect(parts.routeEnrichedItemsForUser).toHaveBeenCalledWith(USER.id, [
      processed,
      linked,
    ])
    expect(parts.updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
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
    expect(parts.deferredRoutingQueue.enqueue).toHaveBeenCalledWith({
      type: 'items',
      userId: USER.id,
      items: [processed, linked],
    })
    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
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
    const noQueueDeps = {
      ...deps,
      deferredRoutingQueue: null,
    } as unknown as StaggeredPollerDeps

    await handleStaggeredPollResult(pollResult(), noQueueDeps)

    expect(parts.routeEnrichedItemsForUser).toHaveBeenCalledWith(USER.id, [
      processed,
    ])
  })

  it('neither routes nor queues when processing yields nothing', async () => {
    await handleStaggeredPollResult(pollResult(), deps)

    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.deferredRoutingQueue.enqueue).not.toHaveBeenCalled()
  })
})

describe('refreshFriendsForStaggeredPolling', () => {
  let deps: StaggeredPollerDeps
  let parts: ReturnType<typeof createDeps>['parts']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkInstanceHealth).mockResolvedValue({
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    })

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it('returns the current friends when nothing changed', async () => {
    const userMap = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
    ])
    parts.plexService.checkFriendChanges.mockResolvedValue(
      friendChanges({ userMap }),
    )

    const { friends, updatedCache } = await refreshFriendsForStaggeredPolling(
      new Map(),
      deps,
    )

    expect(parts.updatePlexUuidCache).toHaveBeenCalledWith(userMap)
    expect(friends).toEqual([
      {
        userId: 9,
        username: 'poll-user',
        watchlistId: 'wl-9',
        isPrimary: false,
      },
    ])
    expect(updatedCache).toEqual(userMap)
    expect(updatedCache).not.toBe(userMap)
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

    await refreshFriendsForStaggeredPolling(new Map(), deps)

    expect(parts.syncSingleFriend).toHaveBeenCalledWith({
      userId: 11,
      username: 'new-friend',
      isPrimary: false,
      watchlistId: 'wl-11',
    })
    expect(parts.routeEnrichedItemsForUser).toHaveBeenCalledWith(11, [
      enrichedItem('brand-new'),
      enrichedItem('linked'),
    ])
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

    await refreshFriendsForStaggeredPolling(new Map(), deps)

    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][1]).toEqual({
      type: 'items',
      userId: 11,
      items: [enrichedItem('brand-new'), enrichedItem('linked')],
    })
    expect(vi.mocked(queueForDeferredRouting).mock.calls[0][2]).toBe(
      'staggered-new-friend',
    )
    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
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
    parts.syncSingleFriend.mockRejectedValue(new Error('friend sync failed'))

    const { friends } = await refreshFriendsForStaggeredPolling(new Map(), deps)

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

    const { friends, updatedCache } = await refreshFriendsForStaggeredPolling(
      new Map(),
      deps,
    )

    expect(parts.etagPoller.invalidateUser).toHaveBeenCalledWith(11, 'wl-11')
    expect(updatedCache.has('wl-11')).toBe(false)
    expect(friends.map((friend) => friend.userId)).toEqual([9])
  })

  it('falls back to the supplied cache when the friend check fails', async () => {
    const cache = new Map<string, UserMapEntry>([
      ['wl-9', { userId: 9, username: 'poll-user' }],
    ])
    parts.plexService.checkFriendChanges.mockRejectedValue(
      new Error('plex down'),
    )

    const { friends, updatedCache } = await refreshFriendsForStaggeredPolling(
      cache,
      deps,
    )

    expect(updatedCache).toBe(cache)
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
