import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'
import { seedWatchlist } from '../../../../helpers/seeds/watchlist.js'

const MOVIE_KEY = '5d77683585719b001f3a3946'
const SHOW_KEY = '5d9c08452df347001e3ae964'

const historyFor = async (key: string) => {
  const knex = getTestDatabase()
  const item = await knex('watchlist_items').where({ user_id: 1, key }).first()
  return knex('watchlist_status_history')
    .where({ watchlist_item_id: item.id })
    .select('status')
    .orderBy('id')
}

describe('watchlist status history', () => {
  let fastify: FastifyInstance

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    await seedInstances(knex)
    await seedUsers(knex)
    await seedWatchlist(knex)
    await knex('watchlist_items')
      .whereIn('key', [MOVIE_KEY, SHOW_KEY])
      .update({ status: 'pending' })
    fastify.contentRouter.clearRouterRulesCache()
  })

  describe('updateWatchlistItem', () => {
    it('records a status change', async () => {
      await fastify.db.updateWatchlistItem(1, MOVIE_KEY, {
        status: 'requested',
        radarr_instance_id: 1,
      })

      expect(await historyFor(MOVIE_KEY)).toEqual([{ status: 'requested' }])
    })

    it('writes nothing for an equal or lower status', async () => {
      await fastify.db.updateWatchlistItem(1, MOVIE_KEY, {
        status: 'grabbed',
        radarr_instance_id: 1,
      })
      await fastify.db.updateWatchlistItem(1, MOVIE_KEY, { status: 'grabbed' })
      await fastify.db.updateWatchlistItem(1, MOVIE_KEY, {
        status: 'requested',
      })

      expect(await historyFor(MOVIE_KEY)).toEqual([{ status: 'grabbed' }])
    })
  })

  describe('bulkUpdateWatchlistItems', () => {
    it('records a status change', async () => {
      await fastify.db.bulkUpdateWatchlistItems([
        {
          userId: 1,
          key: SHOW_KEY,
          status: 'requested',
          sonarr_instance_id: 1,
        },
      ])

      expect(await historyFor(SHOW_KEY)).toEqual([{ status: 'requested' }])
    })

    it('writes nothing for an equal or lower status', async () => {
      await fastify.db.bulkUpdateWatchlistItems([
        { userId: 1, key: SHOW_KEY, status: 'grabbed' },
      ])
      await fastify.db.bulkUpdateWatchlistItems([
        { userId: 1, key: SHOW_KEY, status: 'grabbed' },
        { userId: 1, key: SHOW_KEY, status: 'requested' },
      ])

      expect(await historyFor(SHOW_KEY)).toEqual([{ status: 'grabbed' }])
    })
  })
})
