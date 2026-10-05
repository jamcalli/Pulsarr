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
      { name: expect.any(String), count: 1, movies: 0, shows: 1 },
    ])
  })

  it('GET /v1/stats/all splits top users into movies and shows by range', async () => {
    await getTestDatabase()('watchlist_items').insert({
      user_id: 1,
      title: 'Fresh Movie',
      key: 'fresh-movie',
      type: 'movie',
      thumb: null,
      added: daysAgo(3),
      guids: JSON.stringify(['tmdb:999999']),
      genres: JSON.stringify(['Drama']),
      status: 'pending',
    })

    const inRange = await app.inject({
      method: 'GET',
      url: '/v1/stats/all?days=7',
    })
    expect(inRange.json().top_users).toEqual([
      { name: expect.any(String), count: 2, movies: 1, shows: 1 },
    ])

    const allTime = await app.inject({
      method: 'GET',
      url: '/v1/stats/all?days=0',
    })
    const user = allTime.json().top_users[0]
    expect(user).toEqual({
      name: expect.any(String),
      count: 9,
      movies: 6,
      shows: 3,
    })
  })

  it('GET /v1/stats/all?days=0 ranks every item', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stats/all?days=0' })

    expect(res.statusCode).toBe(200)
    expect(titles(res.json().most_watched_shows)).toContain('Fresh Show')
    expect(res.json().most_watched_shows.length).toBeGreaterThan(1)
  })

  it('GET /v1/stats/genres?days=7 counts only items added in range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/genres?days=7',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([{ genre: 'drama', count: 1 }])
  })

  it('GET /v1/stats/genres without days counts every item', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stats/genres' })

    expect(res.statusCode).toBe(200)
    const drama = res
      .json()
      .find((row: { genre: string }) => row.genre === 'drama')
    expect(drama.count).toBeGreaterThan(1)
    expect(res.json().length).toBeGreaterThan(1)
  })

  it('GET /v1/stats/users?days=7 ranks only items added in range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/stats/users?days=7',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      { name: expect.any(String), count: 1, movies: 0, shows: 1 },
    ])
  })

  it('GET /v1/stats/users without days ranks every item', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/stats/users' })

    expect(res.statusCode).toBe(200)
    expect(res.json()[0]).toEqual({
      name: expect.any(String),
      count: 8,
      movies: 5,
      shows: 3,
    })
  })
})
