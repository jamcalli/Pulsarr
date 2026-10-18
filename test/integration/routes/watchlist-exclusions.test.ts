import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll, seedSystemUser } from '../../helpers/seeds/index.js'
import { SEED_WATCHLIST_ITEMS } from '../../helpers/seeds/watchlist.js'

const SEEDED_MOVIE = SEED_WATCHLIST_ITEMS[0]

describe('watchlist exclusion routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await resetDatabase()
    await seedAll(knex)
    await seedSystemUser(knex)
    app.config.authenticationMethod = 'disabled'
    app.contentRouter.clearRouterRulesCache()
  })

  describe('GET /v1/watchlist-exclusions/items', () => {
    it('pages watchlist items with their exclusion state', async () => {
      await app.db.excludeWatchlistItem(
        SEEDED_MOVIE.key,
        [SEEDED_MOVIE.user_id],
        SEEDED_MOVIE.title,
        'movie',
        [],
      )

      const res = await app.inject({
        method: 'GET',
        url: '/v1/watchlist-exclusions/items?limit=1&exclusion=excluded',
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toMatchObject({
        success: true,
        total: 1,
        limit: 1,
        offset: 0,
      })
      expect(body.items[0]).toMatchObject({
        key: SEEDED_MOVIE.key,
        userId: SEEDED_MOVIE.user_id,
        status: SEEDED_MOVIE.status,
        globalExclusion: null,
      })
      expect(body.items[0].ownExclusion.id).toEqual(expect.any(Number))
    })

    it('rejects an unknown exclusion filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/watchlist-exclusions/items?exclusion=sometimes',
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /v1/watchlist-exclusions/bulk', () => {
    it('creates exclusions and reports duplicates as skipped', async () => {
      const payload = {
        scope: 'users',
        items: [
          {
            key: SEEDED_MOVIE.key,
            userIds: [1, 2],
            title: SEEDED_MOVIE.title,
            type: 'movie',
          },
        ],
      }
      await app.db.excludeWatchlistItem(
        SEEDED_MOVIE.key,
        [1],
        SEEDED_MOVIE.title,
        'movie',
        [],
      )

      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-exclusions/bulk',
        payload,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().result).toEqual({
        created: 1,
        skipped: 1,
        failed: [],
        errors: [],
        total: 1,
      })
    })

    it('rejects a type outside movie and show', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-exclusions/bulk',
        payload: {
          scope: 'global',
          items: [{ key: 'k', userIds: [1], title: 'T', type: 'episode' }],
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /v1/watchlist-exclusions/bulk/remove', () => {
    it('removes exclusions and reports unknown ids', async () => {
      await app.db.excludeWatchlistItem('k', [1], 'T', 'movie', [])
      const [id] = await getTestDatabase()('watchlist_exclusions').pluck('id')

      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-exclusions/bulk/remove',
        payload: { ids: [id, id, 9999] },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().result).toEqual({
        removed: 1,
        failed: [9999],
        errors: ['Exclusion 9999 not found'],
        total: 2,
      })
    })

    it('rejects an empty id list', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchlist-exclusions/bulk/remove',
        payload: { ids: [] },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
