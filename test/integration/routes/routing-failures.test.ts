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

const DONE = {
  status: 'done' as const,
  result: { attempted: 2, resolved: 1, stillFailing: 1, skipped: 0 },
}

describe('routing failure routes', () => {
  let app: FastifyInstance
  let itemA: number
  let itemB: number

  const insertItem = async (userId: number, key: string) => {
    const [row] = await getTestDatabase()('watchlist_items')
      .insert({ user_id: userId, key, title: key, type: 'movie' })
      .returning('id')
    return typeof row === 'object' ? row.id : row
  }

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

    itemA = await insertItem(1, 'failed-a')
    itemB = await insertItem(2, 'failed-b')
    await app.db.setRoutingFailures(1, 'failed-a', [
      { category: 'arr_error', message: 'bad', instanceId: 1 },
    ])
    await app.db.setRoutingFailures(2, 'failed-b', [
      { category: 'missing_ids', message: 'no id' },
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /v1/routing-failures', () => {
    it('lists every failure', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/routing-failures',
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.success).toBe(true)
      expect(body.failures.map((f: { key: string }) => f.key).sort()).toEqual([
        'failed-a',
        'failed-b',
      ])
    })

    it('filters by user and category', async () => {
      const byUser = await app.inject({
        method: 'GET',
        url: '/v1/routing-failures?userId=2',
      })
      expect(byUser.json().failures).toHaveLength(1)
      expect(byUser.json().failures[0].category).toBe('missing_ids')

      const byCategory = await app.inject({
        method: 'GET',
        url: '/v1/routing-failures?category=arr_error',
      })
      expect(byCategory.json().failures).toHaveLength(1)
      expect(byCategory.json().failures[0].key).toBe('failed-a')
    })

    it.each(['category=not_a_category', 'userId=abc', 'userId=0'])(
      'rejects the bad query %s',
      async (query) => {
        const res = await app.inject({
          method: 'GET',
          url: `/v1/routing-failures?${query}`,
        })
        expect(res.statusCode).toBe(400)
      },
    )
  })

  describe('GET /v1/routing-failures/summary', () => {
    it('counts actionable items apart from missing ids', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/routing-failures/summary',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().summary).toMatchObject({
        total: 2,
        actionable: 1,
        byCategory: { arr_error: 1, missing_ids: 1 },
      })
    })
  })

  describe('POST /v1/routing-failures/retry', () => {
    it('refuses while the workflow is not running', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/routing-failures/retry',
      })

      expect(res.statusCode).toBe(409)
    })

    it('refuses while another retry is running', async () => {
      vi.spyOn(app.watchlistWorkflow, 'retryRoutingFailures').mockResolvedValue(
        { status: 'busy' },
      )

      const res = await app.inject({
        method: 'POST',
        url: '/v1/routing-failures/retry',
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().message).toMatch(/already running/)
    })

    it('retries actionable items only when no category is given', async () => {
      const retry = vi
        .spyOn(app.watchlistWorkflow, 'retryRoutingFailures')
        .mockResolvedValue(DONE)

      const res = await app.inject({
        method: 'POST',
        url: '/v1/routing-failures/retry',
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(retry).toHaveBeenCalledWith([itemA])
      expect(res.json()).toEqual({
        success: true,
        message: 'Retry finished: 1 resolved, 1 still failing',
        result: DONE.result,
      })
    })

    it('retries the given category and user', async () => {
      const retry = vi
        .spyOn(app.watchlistWorkflow, 'retryRoutingFailures')
        .mockResolvedValue(DONE)

      await app.inject({
        method: 'POST',
        url: '/v1/routing-failures/retry',
        payload: { userId: 2, category: 'missing_ids' },
      })

      expect(retry).toHaveBeenCalledWith([itemB])
    })

    it('rejects an unknown category', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/routing-failures/retry',
        payload: { category: 'bogus' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /v1/routing-failures/:watchlistItemId/retry', () => {
    it('retries the one item', async () => {
      const retry = vi
        .spyOn(app.watchlistWorkflow, 'retryRoutingFailures')
        .mockResolvedValue(DONE)

      const res = await app.inject({
        method: 'POST',
        url: `/v1/routing-failures/${itemA}/retry`,
      })

      expect(res.statusCode).toBe(200)
      expect(retry).toHaveBeenCalledWith([itemA])
    })

    it('returns 404 for an item with no recorded failure', async () => {
      const clean = await insertItem(1, 'clean')

      const res = await app.inject({
        method: 'POST',
        url: `/v1/routing-failures/${clean}/retry`,
      })

      expect(res.statusCode).toBe(404)
    })

    it('rejects a non-numeric id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/routing-failures/abc/retry',
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
