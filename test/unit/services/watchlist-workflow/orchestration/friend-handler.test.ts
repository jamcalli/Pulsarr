import type {
  EtagUserInfo,
  Item,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { FriendHandlerDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

vi.mock('@services/watchlist-workflow/routing/index.js', () => ({
  checkHealthAndQueueIfUnavailable: vi.fn(async () => ({
    health: {
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    },
    shouldRoute: true,
  })),
  checkInstanceHealth: vi.fn(),
  queueForDeferredRouting: vi.fn(),
  routeMovie: vi.fn(),
  routeShow: vi.fn(),
  routeEnrichedItemsForUser: vi.fn(),
  routeNewItemsForUser: vi.fn(),
  routeSingleItem: vi.fn(),
  hasUserField: vi.fn(),
}))

import {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
  processFriendChanges,
} from '@services/watchlist-workflow/orchestration/friend-handler.js'
import { checkHealthAndQueueIfUnavailable } from '@services/watchlist-workflow/routing/index.js'

const NEW_FRIEND: EtagUserInfo = {
  userId: 42,
  username: 'friend',
  watchlistId: 'wl-42',
  isPrimary: false,
}

function friendItem(key: string): Item {
  return {
    title: key,
    key,
    type: 'movie',
    guids: ['tmdb:1'],
    genres: [],
    user_id: NEW_FRIEND.userId,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function createDeps() {
  const parts = {
    etagPoller: {
      establishBaseline: vi.fn(async () => {}),
      invalidateUser: vi.fn(),
    },
    syncSingleFriend: vi.fn(
      async (): Promise<{ brandNewItems: Item[]; linkedItems: Item[] }> => ({
        brandNewItems: [friendItem('brand-new')],
        linkedItems: [friendItem('linked')],
      }),
    ),
    routeEnrichedItemsForUser: vi.fn(async () => {}),
    updateAutoApprovalUserAttribution: vi.fn(async () => {}),
    scheduleDebouncedStatusSync: vi.fn(),
    updatePlexUuidCache: vi.fn(),
    lookupUserByUuid: vi.fn(async (): Promise<number | null> => null),
    deferredRoutingQueue: { enqueue: vi.fn() },
  }

  const deps = {
    ...parts,
    logger: createMockLogger(),
    config: { skipIfExistsOnPlex: false },
    db: {},
    fastify: { plexServerService: {} },
    plexService: {},
    sonarrManager: {},
    radarrManager: {},
    fetchWatchlists: vi.fn(async () => {}),
    syncWatchlistItems: vi.fn(async () => {}),
    routeNewItemsForUser: vi.fn(async () => {}),
  } as unknown as FriendHandlerDeps

  return { deps, parts }
}

describe('handleNewFriendEtagMode', () => {
  let deps: FriendHandlerDeps
  let parts: ReturnType<typeof createDeps>['parts']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkHealthAndQueueIfUnavailable).mockResolvedValue({
      health: {
        available: true,
        sonarrUnavailable: [],
        radarrUnavailable: [],
        plexServerUnreachable: false,
      },
      shouldRoute: true,
    })

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it('routes brand new and linked items, then establishes the baseline', async () => {
    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(parts.routeEnrichedItemsForUser).toHaveBeenCalledWith(
      NEW_FRIEND.userId,
      [friendItem('brand-new'), friendItem('linked')],
    )
    expect(parts.updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
    expect(parts.scheduleDebouncedStatusSync).toHaveBeenCalledTimes(1)
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
    expect(result).toEqual({ success: true, itemsRouted: 2 })
  })

  it('skips routing but still establishes the baseline when queued instead', async () => {
    vi.mocked(checkHealthAndQueueIfUnavailable).mockResolvedValue({
      health: {
        available: false,
        sonarrUnavailable: [1],
        radarrUnavailable: [],
        plexServerUnreachable: false,
      },
      shouldRoute: false,
    })

    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.updateAutoApprovalUserAttribution).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
    expect(result).toEqual({ success: true, itemsRouted: 2 })
  })

  it('does not check health when the friend watchlist is empty', async () => {
    parts.syncSingleFriend.mockResolvedValue({
      brandNewItems: [],
      linkedItems: [],
    })

    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(checkHealthAndQueueIfUnavailable).not.toHaveBeenCalled()
    expect(parts.routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
    expect(result).toEqual({ success: true, itemsRouted: 0 })
  })

  it('leaves the baseline unset when the friend sync fails', async () => {
    parts.syncSingleFriend.mockRejectedValue(new Error('sync failed'))

    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(parts.etagPoller.establishBaseline).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.itemsRouted).toBe(0)
    expect(result.error?.message).toBe('sync failed')
  })

  it('succeeds without an etag poller', async () => {
    const noPollerDeps = {
      ...deps,
      etagPoller: null,
    } as unknown as FriendHandlerDeps

    const result = await handleNewFriendEtagMode(NEW_FRIEND, noPollerDeps)

    expect(result).toEqual({ success: true, itemsRouted: 2 })
  })
})

describe('handleNewFriendFullMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('establishes the baseline', async () => {
    const { deps, parts } = createDeps()

    await handleNewFriendFullMode(NEW_FRIEND, deps)

    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
  })

  it('does nothing without an etag poller', async () => {
    const { deps } = createDeps()
    const noPollerDeps = {
      ...deps,
      etagPoller: null,
    } as unknown as FriendHandlerDeps

    await expect(
      handleNewFriendFullMode(NEW_FRIEND, noPollerDeps),
    ).resolves.toBeUndefined()
  })
})

describe('handleRemovedFriend', () => {
  it('invalidates the removed friend watchlist', () => {
    const { deps, parts } = createDeps()

    handleRemovedFriend(NEW_FRIEND, deps)

    expect(parts.etagPoller.invalidateUser).toHaveBeenCalledWith(
      NEW_FRIEND.userId,
      NEW_FRIEND.watchlistId,
    )
  })
})

describe('processFriendChanges', () => {
  let deps: FriendHandlerDeps
  let parts: ReturnType<typeof createDeps>['parts']

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkHealthAndQueueIfUnavailable).mockResolvedValue({
      health: {
        available: true,
        sonarrUnavailable: [],
        radarrUnavailable: [],
        plexServerUnreachable: false,
      },
      shouldRoute: true,
    })

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it('syncs added friends in etag mode and refreshes the uuid cache', async () => {
    const userMap = new Map<string, UserMapEntry>([
      ['wl-42', { userId: 42, username: 'friend' }],
    ])

    await processFriendChanges(
      { added: [NEW_FRIEND], removed: [], userMap, mode: 'etag' },
      deps,
    )

    expect(parts.updatePlexUuidCache).toHaveBeenCalledWith(userMap)
    expect(parts.syncSingleFriend).toHaveBeenCalledWith(NEW_FRIEND)
    expect(parts.routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)
  })

  it('only establishes baselines for added friends in full mode', async () => {
    await processFriendChanges(
      {
        added: [NEW_FRIEND],
        removed: [],
        userMap: new Map<string, UserMapEntry>(),
        mode: 'full',
      },
      deps,
    )

    expect(parts.syncSingleFriend).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
  })

  it('invalidates removed friends', async () => {
    await processFriendChanges(
      {
        added: [],
        removed: [NEW_FRIEND],
        userMap: new Map<string, UserMapEntry>(),
        mode: 'etag',
      },
      deps,
    )

    expect(parts.etagPoller.invalidateUser).toHaveBeenCalledWith(
      NEW_FRIEND.userId,
      NEW_FRIEND.watchlistId,
    )
  })
})
