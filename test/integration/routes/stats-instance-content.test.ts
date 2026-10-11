import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

describe('instance content breakdown range', () => {
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

    await knex('watchlist_radarr_instances').insert(
      [
        { watchlistId: 1, age: 2 },
        { watchlistId: 2, age: 2 },
        { watchlistId: 3, age: 40 },
      ].map(({ watchlistId, age }) => ({
        watchlist_id: watchlistId,
        radarr_instance_id: 1,
        status: 'pending',
        is_primary: true,
        syncing: false,
        created_at: daysAgo(age),
        updated_at: daysAgo(age),
      })),
    )
  })

  const radarrTotal = (
    instances: Array<{ type: string; total_items: number }>,
  ) => instances.find((instance) => instance.type === 'radarr')?.total_items

  it('GET /v1/stats/instance-content counts only rows routed within days', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/instance-content?days=7',
    })

    expect(res.statusCode).toBe(200)
    expect(radarrTotal(res.json().instances)).toBe(2)
  })

  it('GET /v1/stats/instance-content with days=0 counts all time', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/instance-content?days=0',
    })

    expect(res.statusCode).toBe(200)
    expect(radarrTotal(res.json().instances)).toBe(3)
  })

  it('GET /v1/stats/instance-content without days counts all time', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/instance-content',
    })

    expect(res.statusCode).toBe(200)
    expect(radarrTotal(res.json().instances)).toBe(3)
  })

  it('GET /v1/stats/all applies days to instance_content_breakdown', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stats/all?days=7' })

    expect(res.statusCode).toBe(200)
    expect(radarrTotal(res.json().instance_content_breakdown)).toBe(2)
  })
})
