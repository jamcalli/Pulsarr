import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { SEED_WATCHLIST_ITEMS } from '../../helpers/seeds/watchlist.js'

// Seeded movie: Night of the Living Dead, user 1
const SEEDED_MOVIE = SEED_WATCHLIST_ITEMS[0]

function handledPayload(mediaItems: string) {
  return {
    notification_type: 'MEDIA_HANDLED',
    subject: 'Media Handled',
    message: 'handled',
    collectionName: 'test-collection',
    mediaItems,
  }
}

describe('POST /v1/notifications/webhook/maintainerr', () => {
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
    app.config.maintainerrEnabled = true
  })

  it('returns 401 for a missing secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      payload: handledPayload('[]'),
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for an invalid secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      headers: { authorization: 'wrong-secret' },
      payload: handledPayload('[]'),
    })

    expect(res.statusCode).toBe(401)
  })

  it('acks non-handled event types without touching the db', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      headers: { authorization: app.config.maintainerrWebhookSecret },
      payload: {
        notification_type: 'TEST_NOTIFICATION',
        subject: 'Test',
        message: 'test',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ success: true, created: 0 })
  })

  it('returns 400 for malformed mediaItems', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      headers: { authorization: app.config.maintainerrWebhookSecret },
      payload: handledPayload('not json'),
    })

    expect(res.statusCode).toBe(400)
  })

  it('writes an exclusion for the current watchlister of handled media', async () => {
    const mediaItems = JSON.stringify([
      {
        mediaServerId: '116021',
        type: 'movie',
        title: SEEDED_MOVIE.title,
        providerIds: { imdb: ['tt0063350'], tmdb: ['10331'], tvdb: ['1831'] },
      },
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      headers: { authorization: app.config.maintainerrWebhookSecret },
      payload: handledPayload(mediaItems),
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ success: true, created: 1 })

    const knex = getTestDatabase()
    const row = await knex('watchlist_exclusions')
      .where({ key: SEEDED_MOVIE.key })
      .first()
    expect(row).toBeDefined()
    expect(row.user_id).toBe(SEEDED_MOVIE.user_id)
    expect(row.title).toBe(SEEDED_MOVIE.title)
    expect(row.type).toBe('movie')
  })

  it('is idempotent on redelivery', async () => {
    const mediaItems = JSON.stringify([
      {
        mediaServerId: '116021',
        type: 'movie',
        title: SEEDED_MOVIE.title,
        providerIds: { imdb: ['tt0063350'], tmdb: [], tvdb: [] },
      },
    ])

    const send = () =>
      app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook/maintainerr',
        headers: { authorization: app.config.maintainerrWebhookSecret },
        payload: handledPayload(mediaItems),
      })

    const first = await send()
    expect(JSON.parse(first.payload).created).toBe(1)

    const second = await send()
    expect(second.statusCode).toBe(200)
    expect(JSON.parse(second.payload).created).toBe(0)

    const knex = getTestDatabase()
    const rows = await knex('watchlist_exclusions').where({
      key: SEEDED_MOVIE.key,
    })
    expect(rows).toHaveLength(1)
  })

  it('acks without writing when the integration is disabled', async () => {
    app.config.maintainerrEnabled = false
    const mediaItems = JSON.stringify([
      {
        mediaServerId: '116021',
        type: 'movie',
        title: SEEDED_MOVIE.title,
        providerIds: { imdb: ['tt0063350'], tmdb: [], tvdb: [] },
      },
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      headers: { authorization: app.config.maintainerrWebhookSecret },
      payload: handledPayload(mediaItems),
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ success: true, created: 0 })

    const knex = getTestDatabase()
    const rows = await knex('watchlist_exclusions').where({
      key: SEEDED_MOVIE.key,
    })
    expect(rows).toHaveLength(0)
  })

  it('ignores items whose guids match nothing on any watchlist', async () => {
    const mediaItems = JSON.stringify([
      {
        mediaServerId: '999',
        type: 'movie',
        title: 'Unknown Movie',
        providerIds: { imdb: ['tt9999999'], tmdb: [], tvdb: [] },
      },
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      headers: { authorization: app.config.maintainerrWebhookSecret },
      payload: handledPayload(mediaItems),
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ success: true, created: 0 })
  })
})
