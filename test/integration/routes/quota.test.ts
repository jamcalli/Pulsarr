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
import { seedAll, seedUserQuota } from '../../helpers/seeds/index.js'

describe('Quota routes clear watchlist cap notices', () => {
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
    await seedUserQuota(getTestDatabase(), {
      user_id: 1,
      content_type: 'movie',
      watchlist_cap: 5,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears the cap notice when a cap changes', async () => {
    const clear = vi.spyOn(app.notifications, 'clearWatchlistCap')

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/1/separate',
      payload: { movieQuota: { enabled: true, watchlistCap: 10 } },
    })

    expect(res.statusCode).toBe(200)
    expect(clear).toHaveBeenCalledWith(1, 'movie')
    expect(clear).not.toHaveBeenCalledWith(1, 'show')
  })

  it('clears the cap notice when a cap is removed', async () => {
    const clear = vi.spyOn(app.notifications, 'clearWatchlistCap')

    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/1',
      payload: { watchlistCap: null },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().userQuotas.movieQuota.watchlistCap).toBeNull()
    expect(clear).toHaveBeenCalledWith(1, 'movie')
  })

  it('clears the cap notice when quotas are deleted', async () => {
    const clear = vi.spyOn(app.notifications, 'clearWatchlistCap')

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/quota/users/1',
    })

    expect(res.statusCode).toBe(200)
    expect(clear).toHaveBeenCalledWith(1, 'movie')
    expect(clear).toHaveBeenCalledWith(1, 'show')
  })

  it('rejects creating a quota without a type and limit with a 400', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/1/separate',
      payload: { showQuota: { enabled: true, watchlistCap: 10 } },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('Show quota type and limit are required')
  })

  it('rejects a bulk update with an incomplete enabled quota', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/bulk',
      payload: {
        userIds: [1],
        operation: 'update',
        movieQuota: { enabled: true, watchlistCap: 10 },
      },
    })

    expect(res.statusCode).toBe(400)
  })
})
