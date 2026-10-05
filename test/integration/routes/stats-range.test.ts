import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

describe('dashboard stats range', () => {
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

    await knex('watchlist_items').insert({
      user_id: 1,
      title: 'Fresh Show',
      key: 'fresh-show',
      type: 'show',
      thumb: null,
      added: daysAgo(2),
      guids: JSON.stringify(['tvdb:999999']),
      genres: JSON.stringify(['Drama']),
      status: 'pending',
    })
  })

  const titles = (rows: Array<{ title: string }>) => rows.map((r) => r.title)

  it('GET /v1/stats/all?days=7 ranks only items added in range', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stats/all?days=7' })

    expect(res.statusCode).toBe(200)
    expect(titles(res.json().most_watched_shows)).toEqual(['Fresh Show'])
    expect(res.json().recent_activity.new_watchlist_items).toBe(1)
    expect(res.json().top_users).toEqual([
      { name: expect.any(String), count: 1 },
    ])
  })

  it('GET /v1/stats/all?days=0 ranks every item', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stats/all?days=0' })

    expect(res.statusCode).toBe(200)
    expect(titles(res.json().most_watched_shows)).toContain('Fresh Show')
    expect(res.json().most_watched_shows.length).toBeGreaterThan(1)
  })
})
