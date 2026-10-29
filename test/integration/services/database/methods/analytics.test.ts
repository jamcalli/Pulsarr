import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedConfig } from '../../../../helpers/seeds/config.js'
import { seedInstances } from '../../../../helpers/seeds/instances.js'
import { seedUsers } from '../../../../helpers/seeds/users.js'

const DAY_MS = 24 * 60 * 60 * 1000

const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY_MS).toISOString()

type HistoryStatus = 'requested' | 'grabbed' | 'notified'

let itemCounter = 0

const insertItem = async (
  type: 'movie' | 'show',
  history: Partial<Record<HistoryStatus, string>>,
  status = 'pending',
) => {
  const knex = getTestDatabase()
  itemCounter++
  const [id] = await knex('watchlist_items').insert({
    user_id: 1,
    title: `Item ${itemCounter}`,
    key: `analytics-item-${itemCounter}`,
    type,
    guids: JSON.stringify([`tmdb:${900000 + itemCounter}`]),
    genres: JSON.stringify([]),
    status,
  })
  const rows = Object.entries(history).map(([historyStatus, timestamp]) => ({
    watchlist_item_id: id,
    status: historyStatus,
    timestamp,
  }))
  if (rows.length > 0) {
    await knex('watchlist_status_history').insert(rows)
  }
  return id
}

describe('analytics database methods', () => {
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
    fastify.caches.clear()
  })

  describe('getRequestToReadyTimes', () => {
    const statFor = async (type: string, days: number) => {
      const rows = await fastify.db.getRequestToReadyTimes(days)
      return rows.find((row) => row.content_type === type)
    }

    it('measures from requested to the earliest later grabbed row', async () => {
      await insertItem('movie', {
        requested: daysAgo(10),
        grabbed: daysAgo(8),
        notified: daysAgo(5),
      })

      expect(await statFor('movie', 30)).toMatchObject({
        count: 1,
        avg_days: expect.closeTo(2, 3),
        min_days: expect.closeTo(2, 3),
        max_days: expect.closeTo(2, 3),
        pending: 0,
      })
    })

    it('counts an item that became ready through a notified row only', async () => {
      await insertItem('show', {
        requested: daysAgo(10),
        notified: daysAgo(7),
      })

      expect(await statFor('show', 30)).toMatchObject({
        count: 1,
        avg_days: expect.closeTo(3, 3),
        pending: 0,
      })
    })

    it('excludes items with no requested row', async () => {
      await insertItem('movie', {
        grabbed: daysAgo(8),
        notified: daysAgo(5),
      })

      expect(await statFor('movie', 0)).toMatchObject({ count: 0, pending: 0 })
    })

    it('excludes items requested outside the window', async () => {
      await insertItem('movie', {
        requested: daysAgo(40),
        grabbed: daysAgo(39),
      })

      expect(await statFor('movie', 30)).toMatchObject({ count: 0, pending: 0 })
    })

    it('counts requested items with no ready row as pending', async () => {
      await insertItem('show', { requested: daysAgo(5) })

      expect(await statFor('show', 30)).toEqual({
        content_type: 'show',
        avg_days: 0,
        min_days: 0,
        max_days: 0,
        median_days: 0,
        p90_days: 0,
        count: 0,
        pending: 1,
      })
    })

    it('counts a ready row stamped in the same millisecond as the request', async () => {
      const at = daysAgo(2)
      await insertItem('movie', { requested: at, grabbed: at })

      expect(await statFor('movie', 30)).toMatchObject({
        count: 1,
        pending: 0,
        min_days: expect.closeTo(0, 3),
      })
    })

    it('reports median and nearest-rank p90 across durations', async () => {
      for (const duration of [4, 1, 10, 3, 2]) {
        await insertItem('movie', {
          requested: daysAgo(20),
          grabbed: daysAgo(20 - duration),
        })
      }

      expect(await statFor('movie', 30)).toEqual({
        content_type: 'movie',
        avg_days: expect.closeTo(4, 3),
        min_days: expect.closeTo(1, 3),
        max_days: expect.closeTo(10, 3),
        median_days: expect.closeTo(3, 3),
        p90_days: expect.closeTo(10, 3),
        count: 5,
        pending: 0,
      })
    })

    it('includes every requested item when days is 0', async () => {
      await insertItem('movie', {
        requested: daysAgo(400),
        grabbed: daysAgo(398),
      })
      await insertItem('movie', { requested: daysAgo(2) })

      expect(await statFor('movie', 0)).toMatchObject({
        count: 1,
        avg_days: expect.closeTo(2, 3),
        pending: 1,
      })
    })
  })

  describe('getWatchlistStatusDistribution', () => {
    it('counts items by their status column', async () => {
      await insertItem('movie', { requested: daysAgo(3) }, 'notified')
      await insertItem('movie', {}, 'pending')
      await insertItem('show', { grabbed: daysAgo(1) }, 'pending')

      expect(await fastify.db.getWatchlistStatusDistribution()).toEqual([
        { status: 'pending', count: 2 },
        { status: 'notified', count: 1 },
      ])
    })

    it('excludes items created before the window', async () => {
      const id = await insertItem('movie', {}, 'requested')
      await getTestDatabase()('watchlist_items')
        .where({ id })
        .update({ created_at: daysAgo(40) })
      await insertItem('show', {}, 'requested')

      expect(await fastify.db.getWatchlistStatusDistribution(30)).toEqual([
        { status: 'requested', count: 1 },
      ])
      expect(await fastify.db.getWatchlistStatusDistribution(0)).toEqual([
        { status: 'requested', count: 2 },
      ])
    })
  })
})
