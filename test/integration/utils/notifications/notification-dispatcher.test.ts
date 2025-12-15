import { processContentNotifications } from '@root/utils/notifications/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../../helpers/database.js'
import { seedAll } from '../../../helpers/seeds/index.js'

describe('Notification Integration Tests', () => {
  beforeEach(async () => {
    await initializeTestDatabase()
    await resetDatabase()
    await seedAll(getTestDatabase())
  })

  describe('processNotifications (database → dispatcher → sender)', () => {
    it('should process movie notifications end-to-end', async (ctx) => {
      const app = await build(ctx)

      // Mock Discord BEFORE ready() to prevent actual API calls
      // We need to mock early because ready() initializes the Discord service
      const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)

      // Wait for plugins to load
      await app.ready()

      // Now mock the Discord method after the service is initialized
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = sendDirectMessageSpy
      }

      // Call processContentNotifications which triggers the full chain
      const result = await processContentNotifications(
        app,
        {
          type: 'movie',
          guid: 'imdb:tt0063350', // Night of the Living Dead
          title: 'Night of the Living Dead',
        },
        false,
        {
          logger: app.log,
        },
      )

      // Should have matched and processed notification for user 1
      expect(result.matchedCount).toBeGreaterThan(0)

      // Should have sent Discord DM (user 1 has notify_discord enabled)
      expect(sendDirectMessageSpy).toHaveBeenCalledWith(
        '111111111111111111',
        expect.objectContaining({
          type: 'movie',
          title: 'Night of the Living Dead',
        }),
      )
    })

    it('should return zero matched for non-existent GUID', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const result = await processContentNotifications(
        app,
        {
          type: 'movie',
          guid: 'imdb:tt9999999',
          title: 'Non-Existent Movie',
        },
        false,
        {
          logger: app.log,
        },
      )

      expect(result.matchedCount).toBe(0)
    })

    it('should process TV show notifications with episodes', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      const sendDirectMessageSpy = vi.fn().mockResolvedValue(undefined)
      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = sendDirectMessageSpy
      }

      const result = await processContentNotifications(
        app,
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
        false,
        {
          logger: app.log,
        },
      )

      expect(result.matchedCount).toBeGreaterThan(0)
      expect(sendDirectMessageSpy).toHaveBeenCalled()
    })

    it('should update watchlist item status to notified', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = vi
          .fn()
          .mockResolvedValue(undefined)
      }

      await processContentNotifications(
        app,
        {
          type: 'movie',
          guid: 'imdb:tt0063350',
          title: 'Night of the Living Dead',
        },
        false,
        {
          logger: app.log,
        },
      )

      // Check that watchlist item was updated
      const knex = getTestDatabase()
      const item = await knex('watchlist_items').where({ id: 1 }).first()

      expect(item.status).toBe('notified')
      expect(item.last_notified_at).not.toBeNull()
    })

    it('should create notification record in database', async (ctx) => {
      const app = await build(ctx)
      await app.ready()

      if (app.notifications?.discordBot) {
        app.notifications.discordBot.sendDirectMessage = vi
          .fn()
          .mockResolvedValue(undefined)
      }

      await processContentNotifications(
        app,
        {
          type: 'movie',
          guid: 'imdb:tt0063350',
          title: 'Night of the Living Dead',
        },
        false,
        {
          logger: app.log,
        },
      )

      // Verify notification record was created
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
  })
})
