import type { FastifyInstance } from 'fastify'
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

describe('user updates', () => {
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
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    app.caches.clear()
    vi.spyOn(app.plexWatchlist, 'getClassifiedUsers').mockResolvedValue({
      success: true,
      users: [],
      untracked: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 404 for an unknown user', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/999',
      payload: { alias: 'Nobody' },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBe('User not found')
  })

  it('returns 409 when the new name is taken', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/2',
      payload: { name: 'test-user-no-sync' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toBe('User with this name already exists')
  })

  it('drops the updated user cached Plex lists', async () => {
    const clearUserLists = vi.spyOn(app.contentRouter, 'clearUserLists')

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/2',
      payload: { alias: 'Renamed' },
    })

    expect(res.statusCode).toBe(200)
    expect(clearUserLists).toHaveBeenCalledWith(2)
  })

  it('enables notifications in bulk only for users with the channel set up', async () => {
    const clearUserLists = vi.spyOn(app.contentRouter, 'clearUserLists')

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/users/bulk',
      payload: { userIds: [3, 4, 999], updates: { notify_discord: true } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ updatedCount: 2, failedIds: [999] })
    const users = await getTestDatabase()('users')
      .whereIn('id', [3, 4])
      .orderBy('id')
    expect(users.map((user) => Boolean(user.notify_discord))).toEqual([
      false,
      false,
    ])
    expect(clearUserLists.mock.calls.map(([id]) => id)).toEqual([3, 4, 999])
  })
})
