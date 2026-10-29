import type {
  EtagUserInfo,
  FriendRequestsResult,
  FriendsResult,
} from '@root/types/plex.types.js'
import type { ProgressEvent } from '@root/types/progress.types.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import {
  cancelFriendRequest,
  getFriendRequests,
  getFriends,
  sendFriendRequest,
} from '@services/plex-watchlist/fetching/friends-api.js'
import { checkForRemovedFriends } from '@services/plex-watchlist/users/friend-users.js'
import {
  PlexWatchlistService,
  USER_STATUS_CACHE_MS,
} from '@services/plex-watchlist.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createDeferred, type Deferred } from '../../helpers/deferred.js'
import { createMockLogger } from '../../mocks/logger.js'

vi.mock('@services/plex-watchlist/users/friend-users.js', () => ({
  checkForRemovedFriends: vi.fn().mockResolvedValue([]),
  ensureFriendUsers: vi
    .fn()
    .mockResolvedValue({ userMap: new Map(), added: [] }),
}))

vi.mock('@services/plex-watchlist/users/token-users.js', () => ({
  ensureTokenUsers: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@services/plex-watchlist/fetching/friends-api.js', () => ({
  getFriends: vi.fn(),
  getFriendRequests: vi.fn(),
  sendFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
}))

const NO_FRIENDS: FriendsResult = {
  friends: new Set(),
  success: false,
  hasApiErrors: true,
}

describe('PlexWatchlistService watchlist syncs', () => {
  let friends: Deferred<FriendsResult>
  let progress: {
    emit: Mock<(event: ProgressEvent) => void>
    hasActiveConnections: () => boolean
  }
  let service: PlexWatchlistService

  beforeEach(() => {
    friends = createDeferred<FriendsResult>()
    vi.mocked(getFriends).mockReset().mockReturnValue(friends.promise)
    progress = { emit: vi.fn(), hasActiveConnections: () => true }
    const fastify = {
      caches: new CacheRegistry(),
      config: { plexTokens: ['admin-token'] },
      progress,
    } as unknown as FastifyInstance
    service = new PlexWatchlistService(createMockLogger(), fastify, fastify.db)
  })

  it('fetches friends once for two concurrent syncs', async () => {
    const first = service.getOthersWatchlists()
    const second = service.getOthersWatchlists()
    friends.resolve(NO_FRIENDS)

    await expect(first).resolves.toEqual({ total: 0, users: [] })
    await expect(second).resolves.toEqual({ total: 0, users: [] })
    expect(getFriends).toHaveBeenCalledTimes(1)
  })

  it('runs a forced sync after the in-flight sync instead of joining it', async () => {
    const first = service.getOthersWatchlists()
    const forced = service.getOthersWatchlists(true)
    await vi.waitFor(() => expect(getFriends).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getFriends).toHaveBeenCalledTimes(1)

    vi.mocked(getFriends).mockResolvedValue(NO_FRIENDS)
    friends.resolve(NO_FRIENDS)
    await Promise.all([first, forced])

    expect(getFriends).toHaveBeenCalledTimes(2)
  })

  it('replays the running sync to late clients and nothing once it settles', async () => {
    const sync = service.getOthersWatchlists()
    await vi.waitFor(() => expect(getFriends).toHaveBeenCalled())

    expect(service.syncSnapshots()).toEqual([
      expect.objectContaining({
        type: 'others-watchlist',
        phase: 'finding-friends',
        progress: 0,
      }),
    ])

    friends.resolve(NO_FRIENDS)
    await sync

    expect(service.syncSnapshots()).toEqual([])
    expect(progress.emit.mock.lastCall?.[0]).toMatchObject({
      phase: 'complete',
      progress: 100,
    })
  })

  it('ends a thrown sync with one failed event and rejects every caller', async () => {
    const first = service.getOthersWatchlists()
    const joined = service.getOthersWatchlists()
    friends.reject(new Error('plex down'))

    await expect(first).rejects.toThrow('plex down')
    await expect(joined).rejects.toThrow('plex down')

    const phases = progress.emit.mock.calls.map(([event]) => event.phase)
    expect(phases).toEqual(['finding-friends', 'failed'])
    expect(service.syncSnapshots()).toEqual([])
  })

  it('reads running for a start queued behind a forced sync until the start settles', async () => {
    const statesOnComplete: string[] = []
    progress.emit.mockImplementation((event) => {
      if (event.phase === 'complete') {
        statesOnComplete.push(service.syncStatus('others-watchlist').state)
      }
    })
    const forced = service.getOthersWatchlists(true)
    await vi.waitFor(() => expect(getFriends).toHaveBeenCalledTimes(1))
    const queued = createDeferred<FriendsResult>()
    vi.mocked(getFriends).mockReturnValue(queued.promise)

    service.startSync('others-watchlist')
    friends.resolve(NO_FRIENDS)
    await forced

    expect(statesOnComplete).toEqual(['running'])

    await vi.waitFor(() => expect(getFriends).toHaveBeenCalledTimes(2))
    queued.resolve(NO_FRIENDS)

    await vi.waitFor(() =>
      expect(service.syncStatus('others-watchlist')).toMatchObject({
        state: 'done',
        total: 0,
        friends: 0,
        error: null,
      }),
    )
    expect(statesOnComplete).toEqual(['running', 'done'])
  })

  it('settles a start that joins a running sync together with it', async () => {
    const running = service.getOthersWatchlists()
    service.startSync('others-watchlist')
    friends.resolve(NO_FRIENDS)
    await running

    await vi.waitFor(() =>
      expect(service.syncStatus('others-watchlist').state).toBe('done'),
    )
    expect(getFriends).toHaveBeenCalledTimes(1)
  })

  it('reads failed with the error once a started sync throws', async () => {
    service.startSync('others-watchlist')
    friends.reject(new Error('plex down'))

    await vi.waitFor(() =>
      expect(service.syncStatus('others-watchlist')).toMatchObject({
        state: 'failed',
        error: 'plex down',
        total: null,
        friends: null,
      }),
    )
  })

  it('reads self syncs with no friend count', () => {
    expect(service.syncStatus('self-watchlist')).toEqual({
      state: 'idle',
      startedAt: null,
      finishedAt: null,
      error: null,
      total: null,
      friends: null,
    })
  })
})

describe('PlexWatchlistService classified users cache', () => {
  const FRIENDS: FriendsResult = {
    friends: new Set(),
    success: true,
    hasApiErrors: false,
  }
  const REQUESTS: FriendRequestsResult = {
    success: true,
    sent: [],
    received: [],
  }
  const REMOVED: EtagUserInfo = {
    userId: 4,
    username: 'Gone',
    watchlistId: 'gone-uuid',
    isPrimary: false,
  }

  let now: number
  let getPlexUsers: Mock
  let plexServerService: {
    getPlexUsers: Mock
    clearFriendCaches: Mock
    clearUserToken: Mock
  }
  let contentRouter: { clearUserLists: Mock }
  let service: PlexWatchlistService

  beforeEach(() => {
    now = 1
    getPlexUsers = vi.fn().mockResolvedValue([])
    plexServerService = {
      getPlexUsers,
      clearFriendCaches: vi.fn(),
      clearUserToken: vi.fn(),
    }
    contentRouter = { clearUserLists: vi.fn() }
    vi.mocked(getFriends).mockReset().mockResolvedValue(FRIENDS)
    vi.mocked(getFriendRequests).mockReset().mockResolvedValue(REQUESTS)
    const db = { getAllUsers: vi.fn().mockResolvedValue([]) }
    const fastify = {
      caches: new CacheRegistry({ now: () => now }),
      config: { plexTokens: ['admin-token'] },
      plexServerService,
      contentRouter,
      db,
    } as unknown as FastifyInstance
    service = new PlexWatchlistService(createMockLogger(), fastify, fastify.db)
  })

  it('keeps a classification for its TTL', async () => {
    await service.getClassifiedUsers()
    now += USER_STATUS_CACHE_MS
    await service.getClassifiedUsers()
    expect(getPlexUsers).toHaveBeenCalledOnce()

    now += 1
    await service.getClassifiedUsers()
    expect(getPlexUsers).toHaveBeenCalledTimes(2)
  })

  it('shares one classification between concurrent reads', async () => {
    await Promise.all([
      service.getClassifiedUsers(),
      service.getClassifiedUsers(),
    ])

    expect(getPlexUsers).toHaveBeenCalledOnce()
  })

  it('returns an incomplete classification without caching it', async () => {
    vi.mocked(getFriendRequests).mockResolvedValue({
      ...REQUESTS,
      success: false,
    })

    await expect(service.getClassifiedUsers()).resolves.toEqual({
      success: true,
      users: [],
      untracked: [],
    })
    await service.getClassifiedUsers()

    expect(getPlexUsers).toHaveBeenCalledTimes(2)
  })

  it('never stores a classification overtaken by a clear', async () => {
    const plexUsers = Promise.withResolvers<[]>()
    getPlexUsers.mockReturnValueOnce(plexUsers.promise)

    const pending = service.getClassifiedUsers()
    service.clearClassifiedUsersCache()
    plexUsers.resolve([])
    await pending
    await service.getClassifiedUsers()

    expect(getPlexUsers).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['sending', () => service.sendFriendRequest('uuid')],
    ['cancelling', () => service.cancelFriendRequest('uuid')],
  ])('drops the friend caches after %s a friend request', async (_, act) => {
    vi.mocked(sendFriendRequest).mockResolvedValue({ success: true })
    vi.mocked(cancelFriendRequest).mockResolvedValue({ success: true })
    await service.getClassifiedUsers()

    await act()
    await service.getClassifiedUsers()

    expect(getPlexUsers).toHaveBeenCalledTimes(2)
    expect(plexServerService.clearFriendCaches).toHaveBeenCalledOnce()
    expect(plexServerService.clearUserToken).not.toHaveBeenCalled()
  })

  it('drops the friend caches and the removed user entries on a friend removal', async () => {
    vi.mocked(checkForRemovedFriends).mockResolvedValue([REMOVED])
    await service.getClassifiedUsers()

    await service.checkFriendChanges()
    await service.getClassifiedUsers()

    expect(getPlexUsers).toHaveBeenCalledTimes(2)
    expect(plexServerService.clearFriendCaches).toHaveBeenCalledOnce()
    expect(plexServerService.clearUserToken).toHaveBeenCalledWith('Gone')
    expect(contentRouter.clearUserLists).toHaveBeenCalledWith(4)
  })
})
