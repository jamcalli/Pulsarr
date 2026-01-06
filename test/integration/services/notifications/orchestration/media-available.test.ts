import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedAll } from '../../../../helpers/seeds/index.js'

describe('sendMediaAvailable Integration Tests', () => {
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
  })

  describe('notification orchestration', () => {
    it('should process movie notifications end-to-end', async () => {
      const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)

      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = sendDirectMessageSpy
      }

      const result = await app.notifications.sendMediaAvailable(
        {
          type: 'movie',
          guid: 'imdb:tt0063350', // Night of the Living Dead
          title: 'Night of the Living Dead',
        },
        {
          isBulkRelease: false,
        },
      )

      expect(result.matchedCount).toBeGreaterThan(0)

      expect(sendDirectMessageSpy).toHaveBeenCalledWith(
        '111111111111111111',
        expect.objectContaining({
          type: 'movie',
          title: 'Night of the Living Dead',
        }),
      )
    })

    it('should return zero matched for non-existent GUID', async () => {
      const result = await app.notifications.sendMediaAvailable(
        {
          type: 'movie',
          guid: 'imdb:tt9999999',
          title: 'Non-Existent Movie',
        },
        {
          isBulkRelease: false,
        },
      )

      expect(result.matchedCount).toBe(0)
    })

    it('should process TV show notifications with episodes', async () => {
      const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = sendDirectMessageSpy
      }

      const result = await app.notifications.sendMediaAvailable(
        {
          type: 'show',
          guid: 'imdb:tt1475582', // Sherlock
          title: 'Sherlock',
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'A Study in Pink',
              airDateUtc: '2010-07-25T00:00:00Z',
            },
          ],
        },
        {
          isBulkRelease: false,
        },
      )

      expect(result.matchedCount).toBeGreaterThan(0)
      expect(sendDirectMessageSpy).toHaveBeenCalled()
    })

    it('should update watchlist item status to notified', async () => {
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = vi
          .fn()
          .mockResolvedValue(undefined)
      }

      await app.notifications.sendMediaAvailable(
        {
          type: 'movie',
          guid: 'imdb:tt0063350',
          title: 'Night of the Living Dead',
        },
        {
          isBulkRelease: false,
        },
      )

      const knex = getTestDatabase()
      const item = await knex('watchlist_items').where({ id: 1 }).first()

      expect(item.status).toBe('notified')
      expect(item.last_notified_at).not.toBeNull()
    })

    it('should create notification record in database', async () => {
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = vi
          .fn()
          .mockResolvedValue(undefined)
      }

      await app.notifications.sendMediaAvailable(
        {
          type: 'movie',
          guid: 'imdb:tt0063350',
          title: 'Night of the Living Dead',
        },
        {
          isBulkRelease: false,
        },
      )

      const knex = getTestDatabase()
      const notifications = await knex('notifications')
        .where({
          watchlist_item_id: 1,
          type: 'movie',
        })
        .select('*')

      expect(notifications.length).toBeGreaterThan(0)
      expect(Boolean(notifications[0].sent_to_discord)).toBe(true)
    })

    it('should handle bulk release for season notifications', async () => {
      const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = sendDirectMessageSpy
      }

      const result = await app.notifications.sendMediaAvailable(
        {
          type: 'show',
          guid: 'imdb:tt1475582', // Sherlock
          title: 'Sherlock',
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'A Study in Pink',
              airDateUtc: '2010-07-25T00:00:00Z',
            },
            {
              seasonNumber: 1,
              episodeNumber: 2,
              title: 'The Blind Banker',
              airDateUtc: '2010-08-01T00:00:00Z',
            },
          ],
        },
        {
          isBulkRelease: true,
        },
      )

      expect(result.matchedCount).toBeGreaterThan(0)
      expect(sendDirectMessageSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'show',
          episodeDetails: expect.objectContaining({
            seasonNumber: 1,
          }),
        }),
      )
    })

    it('should create radarr instance junction record when instanceId provided', async () => {
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = vi
          .fn()
          .mockResolvedValue(undefined)
      }

      await app.notifications.sendMediaAvailable(
        {
          type: 'movie',
          guid: 'imdb:tt0063350',
          title: 'Night of the Living Dead',
        },
        {
          isBulkRelease: false,
          instanceId: 1,
          instanceType: 'radarr',
        },
      )

      const knex = getTestDatabase()
      const junctionRecord = await knex('watchlist_radarr_instances')
        .where({
          watchlist_id: 1,
          radarr_instance_id: 1,
        })
        .first()

      expect(junctionRecord).toBeDefined()
      expect(junctionRecord.status).toBe('notified')
      expect(Boolean(junctionRecord.is_primary)).toBe(true)
    })
  })
})
