import type { DeliveryResult } from '@root/types/notification.types.js'
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
import { createDeferred } from '../../helpers/deferred.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('Webhook Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('POST /v1/notifications/webhook', () => {
    it('should handle test webhook', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        headers: {
          'x-pulsarr-secret': app.config.webhookSecret,
        },
        payload: {
          eventType: 'Test',
          instanceName: 'test-instance',
        },
      })

      expect(res.statusCode).toBe(200)
      const payload = JSON.parse(res.payload)
      expect(payload).toHaveProperty('success')
      expect(payload.success).toBe(true)
    })

    it('should return 401 for missing webhook secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        payload: {
          eventType: 'Test',
          instanceName: 'test-instance',
        },
      })

      expect(res.statusCode).toBe(401)
    })

    it('should return 401 for invalid webhook secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        headers: {
          'x-pulsarr-secret': 'invalid-secret',
        },
        payload: {
          eventType: 'Test',
          instanceName: 'test-instance',
        },
      })

      expect(res.statusCode).toBe(401)
    })

    it('should return 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        headers: {
          'x-pulsarr-secret': app.config.webhookSecret,
        },
        payload: {
          invalidField: 'invalid',
        },
      })

      expect(res.statusCode).toBe(400)
    })

    describe('with a watchlisted movie', () => {
      beforeEach(async () => {
        await resetDatabase()
        await seedAll(getTestDatabase())
        app.webhookQueue.clearDedupeCache()
      })

      afterEach(() => {
        vi.restoreAllMocks()
      })

      it('responds before notification deliveries finish', async () => {
        const delivery = createDeferred<DeliveryResult>()
        const sendDm = vi
          .spyOn(app.notifications.discordBot, 'sendNotification')
          .mockReturnValue(delivery.promise)

        const res = await app.inject({
          method: 'POST',
          url: '/v1/notifications/webhook',
          headers: {
            'x-pulsarr-secret': app.config.webhookSecret,
          },
          payload: {
            instanceName: 'Radarr',
            movie: { title: 'Night of the Living Dead', tmdbId: 10331 },
          },
        })

        expect(res.statusCode).toBe(200)
        await vi.waitFor(() => expect(sendDm).toHaveBeenCalledTimes(1))
        delivery.resolve({ ok: true })
      })

      it('leaves a show sharing the tmdb id untouched', async () => {
        const sendDm = vi
          .spyOn(app.notifications.discordBot, 'sendNotification')
          .mockResolvedValue({ ok: true })
        const knex = getTestDatabase()
        const [show] = await knex('watchlist_items')
          .insert({
            user_id: 2,
            title: 'Same Id Show',
            key: 'shared-tmdb-show',
            type: 'show',
            guids: JSON.stringify(['tmdb:10331']),
            genres: JSON.stringify([]),
            status: 'requested',
          })
          .returning('id')

        const res = await app.inject({
          method: 'POST',
          url: '/v1/notifications/webhook',
          headers: {
            'x-pulsarr-secret': app.config.webhookSecret,
          },
          payload: {
            instanceName: 'Radarr',
            movie: { title: 'Night of the Living Dead', tmdbId: 10331 },
          },
        })

        expect(res.statusCode).toBe(200)
        await vi.waitFor(() => expect(sendDm).toHaveBeenCalledTimes(1))
        const showRow = await knex('watchlist_items')
          .where({ id: show.id })
          .first()
        expect(showRow.status).toBe('requested')
        expect(
          await knex('notifications').where({ watchlist_item_id: show.id }),
        ).toEqual([])
      })

      it('queues the movie as pending when only a show shares the tmdb id', async () => {
        const knex = getTestDatabase()
        await knex('watchlist_items').where({ type: 'movie' }).delete()
        await knex('watchlist_items').insert({
          user_id: 2,
          title: 'Same Id Show',
          key: 'shared-tmdb-show',
          type: 'show',
          guids: JSON.stringify(['tmdb:10331']),
          genres: JSON.stringify([]),
          status: 'requested',
        })

        const res = await app.inject({
          method: 'POST',
          url: '/v1/notifications/webhook',
          headers: {
            'x-pulsarr-secret': app.config.webhookSecret,
          },
          payload: {
            instanceName: 'Radarr',
            movie: { title: 'Night of the Living Dead', tmdbId: 10331 },
          },
        })

        expect(res.statusCode).toBe(200)
        await vi.waitFor(async () =>
          expect(
            await knex('pending_webhooks').where({
              guid: 'tmdb:10331',
              media_type: 'movie',
            }),
          ).toHaveLength(1),
        )
      })
    })

    describe('with a Sonarr episode that has no air date', () => {
      beforeEach(async () => {
        await resetDatabase()
        await seedAll(getTestDatabase())
        app.webhookQueue.clearDedupeCache()
      })

      it('accepts the download and queues the episode', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/notifications/webhook',
          headers: {
            'x-pulsarr-secret': app.config.webhookSecret,
          },
          payload: {
            eventType: 'Download',
            instanceName: 'Sonarr',
            series: { title: 'Undated Show', tvdbId: 987654 },
            episodes: [{ episodeNumber: 1, seasonNumber: 1, title: 'Pilot' }],
            episodeFile: {
              id: 1,
              relativePath: 'Season 01/Undated Show - S01E01.mkv',
              quality: 'WEBDL-1080p',
              qualityVersion: 1,
              size: 1000,
            },
          },
        })

        expect(res.statusCode).toBe(200)
        expect(app.webhookQueue.queue['987654']?.seasons[1]?.episodes).toEqual([
          { episodeNumber: 1, seasonNumber: 1, title: 'Pilot' },
        ])
      })
    })
  })
})
