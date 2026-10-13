import { USER_STATUS_CACHE_MS } from '@services/plex-watchlist.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const FRIEND_UUID = 'friend-uuid'
const UNKNOWN_UUID = 'unknown-uuid'
const NO_SYNC_UUID = 'no-sync-uuid'

describe('users friend status', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    const knex = getTestDatabase()
    await seedAll(knex)
    app.config.authenticationMethod = 'disabled'
    app.plexWatchlist.clearClassifiedUsersCache()

    await knex('users').where('id', 2).update({ plex_uuid: FRIEND_UUID })
    await knex('users').where('id', 3).update({ plex_uuid: UNKNOWN_UUID })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockClassifier = () =>
    vi.spyOn(app.plexWatchlist, 'getClassifiedUsers').mockResolvedValue({
      success: true,
      users: [
        {
          uuid: FRIEND_UUID,
          username: 'test-user-discord-apprise',
          avatar: '',
          displayName: 'Friend',
          status: 'friend',
          friendCreatedAt: null,
          pendingSince: null,
        },
      ],
      untracked: [],
    })

  it('GET /v1/users/list skips classification and has no friend fields', async () => {
    const classifier = mockClassifier()

    const res = await app.inject({ method: 'GET', url: '/v1/users/list' })

    expect(res.statusCode).toBe(200)
    const users: Array<Record<string, unknown>> = res.json().users
    expect(users.length).toBeGreaterThan(1)
    for (const user of users) {
      expect(user).not.toHaveProperty('friendStatus')
      expect(user).not.toHaveProperty('pendingSince')
    }
    expect(classifier).not.toHaveBeenCalled()
  })

  it('GET /v1/users/list/with-counts classifies friend, self and unknown users', async () => {
    mockClassifier()

    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/list/with-counts',
    })

    expect(res.statusCode).toBe(200)
    const users: Array<{
      id: number
      friendStatus: string | null
      pendingSince: string | null
    }> = res.json().users
    const byId = (id: number) => users.find((user) => user.id === id)

    expect(byId(1)).toMatchObject({ friendStatus: 'self', pendingSince: null })
    expect(byId(2)).toMatchObject({
      friendStatus: 'friend',
      pendingSince: null,
    })
    expect(byId(3)).toMatchObject({ friendStatus: null, pendingSince: null })
    expect(byId(4)).toMatchObject({ friendStatus: null, pendingSince: null })
  })

  it('GET /v1/users/:id carries the friend status', async () => {
    mockClassifier()

    const res = await app.inject({ method: 'GET', url: '/v1/users/2' })

    expect(res.statusCode).toBe(200)
    expect(res.json().user.friendStatus).toBe('friend')
  })

  it('PATCH /v1/users/:id carries the friend status', async () => {
    mockClassifier()

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/2',
      payload: { alias: 'Renamed' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().user.friendStatus).toBe('friend')
  })

  it('keeps self and returns null statuses for others when the classifier throws', async () => {
    vi.spyOn(app.plexWatchlist, 'getClassifiedUsers').mockRejectedValue(
      new Error('Plex unreachable'),
    )

    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/list/with-counts',
    })

    expect(res.statusCode).toBe(200)
    const users: Array<{
      id: number
      friendStatus: string | null
      pendingSince: string | null
    }> = res.json().users
    expect(users.length).toBeGreaterThan(1)
    for (const user of users) {
      expect(user).toMatchObject({
        friendStatus: user.id === 1 ? 'self' : null,
        pendingSince: null,
      })
    }
  })

  describe('classification cache', () => {
    let originalTokens: string[]

    beforeEach(() => {
      originalTokens = app.config.plexTokens
      app.config.plexTokens = ['test-plex-token']
    })

    afterEach(() => {
      app.config.plexTokens = originalTokens
    })

    const spyServerUsers = () =>
      vi.spyOn(app.plexServerService, 'getPlexUsers').mockResolvedValue([])

    it('reuses a classification across list calls until a friend request clears it', async () => {
      const serverUsers = spyServerUsers()
      const list = () =>
        app.inject({ method: 'GET', url: '/v1/users/list/with-counts' })

      expect((await list()).statusCode).toBe(200)
      expect((await list()).statusCode).toBe(200)
      expect(serverUsers).toHaveBeenCalledTimes(1)

      const sent = await app.plexWatchlist.sendFriendRequest(FRIEND_UUID)
      expect(sent.success).toBe(true)

      expect((await list()).statusCode).toBe(200)
      expect(serverUsers).toHaveBeenCalledTimes(2)
    })

    const onCommunityQuery = (
      operation: 'GetAllFriends' | 'GetFriendRequests',
      respond: () => Response,
    ) =>
      server.use(
        http.post('https://community.plex.tv/api', async ({ request }) => {
          const body = (await request.clone().json()) as { query: string }
          if (body.query.includes(`query ${operation}`)) return respond()
        }),
      )

    it('does not cache a classification when friend requests fail', async () => {
      const serverUsers = spyServerUsers()
      onCommunityQuery(
        'GetFriendRequests',
        () => new HttpResponse(null, { status: 500 }),
      )
      const list = () =>
        app.inject({ method: 'GET', url: '/v1/users/list/with-counts' })

      expect((await list()).statusCode).toBe(200)
      expect((await list()).statusCode).toBe(200)
      expect(serverUsers).toHaveBeenCalledTimes(2)
    })

    it('clears the classification when the friend sync creates a user', async () => {
      const serverUsers = spyServerUsers()
      await getTestDatabase()('users')
        .where('id', 4)
        .update({ plex_uuid: NO_SYNC_UUID })
      const friend = (id: string, username: string) => ({
        user: { id, username, avatar: '', displayName: username },
        createdAt: '2024-01-01T00:00:00Z',
      })
      onCommunityQuery('GetAllFriends', () =>
        HttpResponse.json({
          data: {
            allFriendsV2: [
              friend(FRIEND_UUID, 'test-user-discord-apprise'),
              friend(UNKNOWN_UUID, 'test-user-all-notifications'),
              friend(NO_SYNC_UUID, 'test-user-no-sync'),
              friend('new-friend-uuid', 'new-friend'),
            ],
          },
        }),
      )
      const list = () =>
        app.inject({ method: 'GET', url: '/v1/users/list/with-counts' })

      expect((await list()).statusCode).toBe(200)
      expect(serverUsers).toHaveBeenCalledTimes(1)

      const changes = await app.plexWatchlist.checkFriendChanges()
      expect(changes.removed).toEqual([])
      expect(changes.added.map((user) => user.username)).toEqual(['new-friend'])

      expect((await list()).statusCode).toBe(200)
      expect(serverUsers).toHaveBeenCalledTimes(2)
    })

    it('refetches once the cache window has passed', async () => {
      const serverUsers = spyServerUsers()
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)

      await app.plexWatchlist.getClassifiedUsers()
      clock.mockReturnValue(now + USER_STATUS_CACHE_MS - 1)
      await app.plexWatchlist.getClassifiedUsers()
      expect(serverUsers).toHaveBeenCalledTimes(1)

      clock.mockReturnValue(now + USER_STATUS_CACHE_MS)
      await app.plexWatchlist.getClassifiedUsers()
      expect(serverUsers).toHaveBeenCalledTimes(2)
    })
  })
})
