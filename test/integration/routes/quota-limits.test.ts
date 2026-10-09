import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('Quota limit and watchlist cap bounds', () => {
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
  })

  it('rejects creating a quota with a limit above 1000', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/quota/users',
      payload: { userId: 1, quotaType: 'daily', quotaLimit: 1001 },
    })

    expect(res.statusCode).toBe(400)
  })

  it('rejects creating a quota with a watchlist cap above 10000', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/quota/users',
      payload: {
        userId: 1,
        quotaType: 'daily',
        quotaLimit: 5,
        watchlistCap: 10001,
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it('creates a quota at both upper bounds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/quota/users',
      payload: {
        userId: 1,
        quotaType: 'daily',
        quotaLimit: 1000,
        watchlistCap: 10000,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().userQuotas.movieQuota).toMatchObject({
      quotaLimit: 1000,
      watchlistCap: 10000,
    })
  })

  it('rejects updating separate quotas past either bound', async () => {
    const overLimit = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/1/separate',
      payload: { movieQuota: { enabled: true, quotaLimit: 1001 } },
    })
    const overCap = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/1/separate',
      payload: { showQuota: { enabled: true, watchlistCap: 10001 } },
    })

    expect(overLimit.statusCode).toBe(400)
    expect(overCap.statusCode).toBe(400)
  })

  it('rejects a bulk update with a watchlist cap above 10000', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/quota/users/bulk',
      payload: {
        userIds: [1],
        operation: 'update',
        movieQuota: { enabled: true, quotaLimit: 5, watchlistCap: 10001 },
      },
    })

    expect(res.statusCode).toBe(400)
  })
})
