import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedAll } from '../../../../helpers/seeds/index.js'

const MOVIE = {
  type: 'movie' as const,
  guid: 'imdb:tt0063350', // Night of the Living Dead, watchlisted by user 1
  title: 'Night of the Living Dead',
}

describe('sendMediaAvailable with quiet hours / digests', () => {
  let app: FastifyInstance
  let sendDirectMessage: MockInstance<
    FastifyInstance['notifications']['discordBot']['sendDirectMessage']
  >

  const heldRows = () => getTestDatabase()('held_notifications').select('*')

  beforeAll(async () => {
    app = await build()
    await app.ready()
    // Flushes are driven by hand below
    await app.notifications.deliveryScheduler.stop()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    vi.restoreAllMocks()
    sendDirectMessage = vi
      .spyOn(app.notifications.discordBot, 'sendDirectMessage')
      .mockResolvedValue(true)
  })

  it('delivers immediately when the feature is off (unchanged behaviour)', async () => {
    await app.notifications.sendMediaAvailable(MOVIE, { isBulkRelease: false })

    expect(sendDirectMessage).toHaveBeenCalledWith(
      '111111111111111111',
      expect.objectContaining({ type: 'movie', title: MOVIE.title }),
    )
    expect(await heldRows()).toHaveLength(0)
  })

  it('holds the user notification instead of sending it', async () => {
    await getTestDatabase()('users')
      .where({ id: 1 })
      .update({ notify_digest_mode: 'window' })

    const result = await app.notifications.sendMediaAvailable(MOVIE, {
      isBulkRelease: false,
    })

    expect(result.matchedCount).toBeGreaterThan(0)
    expect(sendDirectMessage).not.toHaveBeenCalled()

    const rows = await heldRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user_id: 1,
      media_type: 'movie',
      guid: MOVIE.guid,
      reason: 'digest',
      watchlist_item_key: '5d77683585719b001f3a3946',
    })

    // The dedupe record is written at hold time...
    const records = await getTestDatabase()('notifications').where({
      user_id: 1,
      type: 'movie',
    })
    expect(records).toHaveLength(1)

    // ...so a repeat webhook is not held a second time
    await app.notifications.sendMediaAvailable(MOVIE, { isBulkRelease: false })
    expect(await heldRows()).toHaveLength(1)
  })

  it('sends the held notification once it is due', async () => {
    await getTestDatabase()('users')
      .where({ id: 1 })
      .update({ notify_digest_mode: 'window' })
    await app.notifications.sendMediaAvailable(MOVIE, { isBulkRelease: false })

    await getTestDatabase()('held_notifications').update({
      deliver_after: new Date(Date.now() - 1000).toISOString(),
    })
    await app.notifications.deliveryScheduler.flushDue()

    expect(sendDirectMessage).toHaveBeenCalledTimes(1)
    expect(sendDirectMessage).toHaveBeenCalledWith(
      '111111111111111111',
      expect.objectContaining({ type: 'movie', title: MOVIE.title }),
    )
    expect(await heldRows()).toHaveLength(0)
  })

  it('applies admin defaults to users without overrides', async () => {
    await app.updateConfig({
      notificationDelivery: {
        digestMode: 'daily',
        digestWindowMinutes: 15,
        digestTime: '09:00',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        timezone: '',
      },
    })
    try {
      await app.notifications.sendMediaAvailable(MOVIE, {
        isBulkRelease: false,
      })
      expect(sendDirectMessage).not.toHaveBeenCalled()
      expect(await heldRows()).toHaveLength(1)
    } finally {
      await app.updateConfig({ notificationDelivery: undefined })
    }
  })

  it('leaves public channel notifications unchanged', async () => {
    await getTestDatabase()('users')
      .where({ id: 1 })
      .update({ notify_digest_mode: 'window' })
    const sendPublicNotification = vi
      .spyOn(app.notifications.discordWebhook, 'sendPublicNotification')
      .mockResolvedValue(true)
    const previous = app.config.publicContentNotifications
    await app.updateConfig({
      publicContentNotifications: {
        enabled: true,
        discordWebhookUrls: 'https://discord.com/api/webhooks/1/abc',
      },
    })
    try {
      await app.notifications.sendMediaAvailable(MOVIE, {
        isBulkRelease: false,
      })
    } finally {
      await app.updateConfig({ publicContentNotifications: previous })
    }

    expect(sendDirectMessage).not.toHaveBeenCalled()
    expect(sendPublicNotification).toHaveBeenCalledTimes(1)
    expect(await heldRows()).toHaveLength(1)
  })
})
