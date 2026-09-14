import type {
  EtagUserInfo,
  Friend,
  Item,
  TokenWatchlistItem,
  UserMapEntry,
} from '@root/types/plex.types.js'
import { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

vi.mock('@services/plex-watchlist/index.js', () => ({
  getOthersWatchlist: vi.fn(async () => new Map()),
  extractKeysAndRelationships: vi.fn(() => ({
    allKeys: new Set<string>(),
    userKeyMap: new Map(),
  })),
  getExistingItems: vi.fn(async () => []),
  categorizeItems: vi.fn(() => ({
    brandNewItems: new Map(),
    existingItemsToLink: new Map(),
  })),
  processAndSaveNewItems: vi.fn(async () => new Map()),
  linkExistingItems: vi.fn(async () => {}),
  handleLinkedItemsForLabelSync: vi.fn(async () => {}),
}))

vi.mock('@services/watchlist-workflow/routing/health-checker.js', () => ({
  checkHealthAndQueueIfUnavailable: vi.fn(async () => ({
    health: {
      available: true,
      sonarrUnavailable: [],
      radarrUnavailable: [],
      plexServerUnreachable: false,
    },
    shouldRoute: true,
  })),
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

import {
  categorizeItems,
  getOthersWatchlist,
  processAndSaveNewItems,
} from '@services/plex-watchlist/index.js'
import { updateAutoApprovalUserAttribution } from '@services/watchlist-workflow/attribution/approval-attributor.js'
import {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
  processFriendChanges,
} from '@services/watchlist-workflow/orchestration/friend-handler.js'
import { checkHealthAndQueueIfUnavailable } from '@services/watchlist-workflow/routing/health-checker.js'
import { routeEnrichedItemsForUser } from '@services/watchlist-workflow/routing/item-router.js'

const NEW_FRIEND: EtagUserInfo = {
  userId: 42,
  username: 'friend',
  watchlistId: 'wl-42',
  isPrimary: false,
}

const FRIEND_KEY: Friend = {
  watchlistId: 'wl-42',
  username: 'friend',
  userId: 42,
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

function tokenItem(key: string): TokenWatchlistItem {
  return { ...friendItem(key), id: key }
}

function stubFriendWatchlist() {
  vi.mocked(getOthersWatchlist).mockResolvedValue(
    new Map([[FRIEND_KEY, new Set([tokenItem('brand-new')])]]),
  )
  vi.mocked(categorizeItems).mockReturnValue({
    brandNewItems: new Map(),
    existingItemsToLink: new Map([
      [FRIEND_KEY, new Set([friendItem('linked')])],
    ]),
  })
  vi.mocked(processAndSaveNewItems).mockResolvedValue(
    new Map([[FRIEND_KEY, new Set([friendItem('brand-new')])]]),
  )
}

function createDeps() {
  const state = new WorkflowState()
  state.etagPoller = {
    establishBaseline: vi.fn(async () => {}),
    invalidateUser: vi.fn(),
  } as unknown as NonNullable<WorkflowState['etagPoller']>
  state.deferredRoutingQueue = { enqueue: vi.fn() } as unknown as NonNullable<
    WorkflowState['deferredRoutingQueue']
  >

  const parts = {
    etagPoller: state.etagPoller,
    scheduleDebouncedStatusSync: vi
      .spyOn(state, 'scheduleDebouncedStatusSync')
      .mockImplementation(() => {}),
    updatePlexUuidCache: vi.spyOn(state, 'updatePlexUuidCache'),
  }

  const deps = {
    state,
    logger: createMockLogger(),
    config: { skipIfExistsOnPlex: false, plexTokens: ['token'] },
    db: {},
    fastify: { plexServerService: {} },
    plexService: {},
    sonarrManager: {},
    radarrManager: {},
    itemProcessorDeps: {},
  } as unknown as WorkflowDeps

  return { deps, parts, state }
}

describe('handleNewFriendEtagMode', () => {
  let deps: WorkflowDeps
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
    stubFriendWatchlist()

    const created = createDeps()
    deps = created.deps
    parts = created.parts
  })

  it('routes brand new and linked items, then establishes the baseline', async () => {
    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(routeEnrichedItemsForUser).toHaveBeenCalledWith(
      NEW_FRIEND.userId,
      [friendItem('brand-new'), friendItem('linked')],
      deps,
    )
    expect(updateAutoApprovalUserAttribution).toHaveBeenCalledTimes(1)
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

    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(updateAutoApprovalUserAttribution).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
    expect(result).toEqual({ success: true, itemsRouted: 2 })
  })

  it('does not check health when the friend watchlist is empty', async () => {
    vi.mocked(getOthersWatchlist).mockResolvedValue(new Map())

    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(checkHealthAndQueueIfUnavailable).not.toHaveBeenCalled()
    expect(routeEnrichedItemsForUser).not.toHaveBeenCalled()
    expect(parts.etagPoller.establishBaseline).toHaveBeenCalledWith(NEW_FRIEND)
    expect(result).toEqual({ success: true, itemsRouted: 0 })
  })

  it('leaves the baseline unset when the friend sync fails', async () => {
    vi.mocked(getOthersWatchlist).mockRejectedValue(new Error('sync failed'))

    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

    expect(parts.etagPoller.establishBaseline).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.itemsRouted).toBe(0)
    expect(result.error?.message).toBe('sync failed')
  })

  it('succeeds without an etag poller', async () => {
    deps.state.etagPoller = null

    const result = await handleNewFriendEtagMode(NEW_FRIEND, deps)

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
    deps.state.etagPoller = null

    await expect(
      handleNewFriendFullMode(NEW_FRIEND, deps),
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
  let deps: WorkflowDeps
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
    stubFriendWatchlist()

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

    expect(parts.updatePlexUuidCache).toHaveBeenCalledWith(userMap, deps.logger)
    expect(getOthersWatchlist).toHaveBeenCalledTimes(1)
    expect(routeEnrichedItemsForUser).toHaveBeenCalledTimes(1)
    expect(vi.mocked(routeEnrichedItemsForUser).mock.calls[0][0]).toBe(
      NEW_FRIEND.userId,
    )
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

    expect(getOthersWatchlist).not.toHaveBeenCalled()
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
