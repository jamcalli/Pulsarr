import type { MediaNotification } from '@root/types/discord.types.js'
import {
  FLUSH_INTERVAL_MS,
  type HoldRequest,
  NotificationDeliveryScheduler,
} from '@services/notifications/delivery-schedule/index.js'
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
import { build } from '../../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../../helpers/database.js'
import { seedAll } from '../../../../helpers/seeds/index.js'
import { createMockLogger } from '../../../../mocks/logger.js'

// Dates sit in the future so nothing here is ever due on the real clock
const T0 = Date.parse('2027-05-01T12:00:00Z')
const MINUTE = 60_000

// Seed user 1: Discord only; user 2: Discord + Apprise; user 3: Apprise + Plex mobile
const DISCORD_USER = 1
const ALL_CHANNELS_USER = 3

function episodeRequest(
  userId: number,
  guid: string,
  title: string,
  season: number,
  episode: number,
): HoldRequest {
  const notification: MediaNotification = {
    type: 'show',
    title,
    username: `user${userId}`,
    posterUrl: `https://img/${guid}.jpg`,
    episodeDetails: {
      title: `Episode ${episode}`,
      seasonNumber: season,
      episodeNumber: episode,
    },
  }
  return {
    user: { id: userId, name: `user${userId}` },
    notification,
    media: {
      type: 'show',
      guid,
      title,
      episodes: [{ seasonNumber: season, episodeNumber: episode }],
    },
    isBulkRelease: false,
    watchlistItemKey: `key-${guid}`,
  }
}

function movieRequest(userId: number, guid: string, title: string) {
  return {
    user: { id: userId, name: `user${userId}` },
    notification: { type: 'movie', title, username: `user${userId}` },
    media: { type: 'movie', guid, title },
    isBulkRelease: false,
    watchlistItemKey: `key-${guid}`,
  } satisfies HoldRequest
}

describe('NotificationDeliveryScheduler', () => {
  let app: FastifyInstance
  let clock: number
  let channels: ReturnType<typeof createChannels>
  let notificationDelivery: Record<string, unknown> | undefined

  function createChannels() {
    return {
      discordBot: {
        sendDirectMessage: vi.fn().mockResolvedValue(true),
        sendDirectMessageEmbed: vi.fn().mockResolvedValue(true),
      },
      apprise: {
        isEnabled: vi.fn().mockReturnValue(true),
        sendMediaNotification: vi.fn().mockResolvedValue(true),
        sendMediaDigestNotification: vi.fn().mockResolvedValue(true),
      },
      plexMobile: {
        isEnabled: vi.fn().mockReturnValue(true),
        sendMediaNotification: vi.fn().mockResolvedValue(true),
      },
    }
  }

  function createScheduler(logger = createMockLogger()) {
    return new NotificationDeliveryScheduler({
      db: app.db,
      logger,
      getConfig: () => ({
        notificationDelivery: notificationDelivery as never,
      }),
      ...channels,
      now: () => clock,
    })
  }

  async function setUserSchedule(
    userId: number,
    fields: Record<string, unknown>,
  ) {
    await getTestDatabase()('users').where({ id: userId }).update(fields)
  }

  const heldRows = () => getTestDatabase()('held_notifications').select('*')

  beforeAll(async () => {
    app = await build()
    await app.ready()
    // The app's own flusher runs on the real clock; keep it out of the way
    await app.notifications.deliveryScheduler.stop()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    clock = T0
    channels = createChannels()
    notificationDelivery = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('feature off', () => {
    it('does not hold anything with default settings', async () => {
      const scheduler = createScheduler()

      const held = await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      expect(held).toBe(false)
      expect(await heldRows()).toHaveLength(0)
    })

    it('does not hold when the user opts out of admin defaults', async () => {
      notificationDelivery = {
        digestMode: 'window',
        digestWindowMinutes: 15,
        quietHoursEnabled: true,
      }
      await setUserSchedule(DISCORD_USER, {
        notify_digest_mode: 'off',
        notify_quiet_hours_enabled: false,
      })

      const held = await createScheduler().holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      expect(held).toBe(false)
    })

    it('delivers immediately if holding fails', async () => {
      await setUserSchedule(DISCORD_USER, { notify_digest_mode: 'window' })
      const logger = createMockLogger()
      const scheduler = createScheduler(logger)
      vi.spyOn(app.db, 'createHeldNotification').mockRejectedValueOnce(
        new Error('disk full'),
      )

      const held = await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      expect(held).toBe(false)
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('digest window', () => {
    beforeEach(async () => {
      await setUserSchedule(DISCORD_USER, {
        notify_digest_mode: 'window',
        notify_digest_window_minutes: 15,
      })
    })

    it('coalesces a season import into one message when the window ends', async () => {
      const scheduler = createScheduler()

      for (let episode = 1; episode <= 8; episode++) {
        clock = T0 + (episode - 1) * 1000
        expect(
          await scheduler.holdIfScheduled(
            episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 2, episode),
          ),
        ).toBe(true)
      }

      clock = T0 + 14 * MINUTE
      expect(await scheduler.flushDue()).toBe(0)
      expect(channels.discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()

      clock = T0 + 15 * MINUTE
      expect(await scheduler.flushDue()).toBe(1)

      expect(channels.discordBot.sendDirectMessage).not.toHaveBeenCalled()
      expect(channels.discordBot.sendDirectMessageEmbed).toHaveBeenCalledTimes(
        1,
      )
      const [discordId, embed] =
        channels.discordBot.sendDirectMessageEmbed.mock.calls[0]
      expect(discordId).toBe('111111111111111111')
      expect(embed.title).toBe('Show X')
      expect(embed.fields).toContainEqual({
        name: 'Episodes',
        value: 'S02E01–E08',
        inline: false,
      })
      expect(await heldRows()).toHaveLength(0)
    })

    it('joins later arrivals to the open batch instead of extending it', async () => {
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      clock = T0 + 10 * MINUTE
      await scheduler.holdIfScheduled(movieRequest(DISCORD_USER, 'tmdb:9', 'Y'))

      clock = T0 + 15 * MINUTE
      await scheduler.flushDue()

      expect(channels.discordBot.sendDirectMessageEmbed).toHaveBeenCalledTimes(
        1,
      )
      const [, embed] = channels.discordBot.sendDirectMessageEmbed.mock.calls[0]
      expect(embed.title).toBe('2 new titles available')
      expect(await heldRows()).toHaveLength(0)
    })

    it('sends a lone held notification exactly as it would have been sent', async () => {
      const scheduler = createScheduler()
      const request = episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1)
      await scheduler.holdIfScheduled(request)

      clock = T0 + 15 * MINUTE
      await scheduler.flushDue()

      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledWith(
        '111111111111111111',
        request.notification,
      )
      expect(channels.discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()
    })

    it('flushes on the interval timer once started', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      await scheduler.start()
      expect(channels.discordBot.sendDirectMessage).not.toHaveBeenCalled()

      clock = T0 + 15 * MINUTE
      await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS)
      await vi.waitFor(() =>
        expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1),
      )

      await scheduler.stop()
    })

    it('only delivers users whose batch is due', async () => {
      await setUserSchedule(2, {
        notify_digest_mode: 'window',
        notify_digest_window_minutes: 60,
      })
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      await scheduler.holdIfScheduled(
        episodeRequest(2, 'tvdb:2', 'Show Z', 1, 1),
      )

      clock = T0 + 15 * MINUTE
      await scheduler.flushDue()

      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1)
      const remaining = await heldRows()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].user_id).toBe(2)
    })
  })

  describe('per-channel delivery', () => {
    it('sends a digest on Apprise and one Plex push per title', async () => {
      await setUserSchedule(ALL_CHANNELS_USER, { notify_digest_mode: 'window' })
      const scheduler = createScheduler()
      for (const episode of [1, 2, 3]) {
        await scheduler.holdIfScheduled(
          episodeRequest(ALL_CHANNELS_USER, 'tvdb:1', 'Show X', 2, episode),
        )
      }
      await scheduler.holdIfScheduled(
        movieRequest(ALL_CHANNELS_USER, 'tmdb:9', 'Movie Y'),
      )

      clock = T0 + 15 * MINUTE
      await scheduler.flushDue()

      // No Discord ID → no DM
      expect(channels.discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()

      expect(
        channels.apprise.sendMediaDigestNotification,
      ).toHaveBeenCalledTimes(1)
      const [user, entries] =
        channels.apprise.sendMediaDigestNotification.mock.calls[0]
      expect(user.id).toBe(ALL_CHANNELS_USER)
      expect(entries).toEqual([
        {
          type: 'show',
          title: 'Show X',
          detail: 'S02E01–E03',
          posterUrl: 'https://img/tvdb:1.jpg',
        },
        { type: 'movie', title: 'Movie Y' },
      ])

      const plexCalls = channels.plexMobile.sendMediaNotification.mock.calls
      expect(plexCalls).toHaveLength(2)
      expect(plexCalls[0][1]).toMatchObject({
        title: 'Show X',
        episodeDetails: { seasonNumber: 2 },
      })
      expect(plexCalls[0].slice(2)).toEqual(['key-tvdb:1', 'tvdb:1', true])
      expect(plexCalls[1].slice(2)).toEqual(['key-tmdb:9', 'tmdb:9', false])
    })

    it('uses the channel settings in effect at delivery time', async () => {
      await setUserSchedule(DISCORD_USER, { notify_digest_mode: 'window' })
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      await setUserSchedule(DISCORD_USER, { notify_discord: false })

      clock = T0 + 15 * MINUTE
      await scheduler.flushDue()

      expect(channels.discordBot.sendDirectMessage).not.toHaveBeenCalled()
      expect(await heldRows()).toHaveLength(0)
    })

    it('drops held rows when the user is deleted', async () => {
      await setUserSchedule(2, { notify_digest_mode: 'window' })
      await createScheduler().holdIfScheduled(
        episodeRequest(2, 'tvdb:1', 'Show X', 1, 1),
      )

      expect(await app.db.deleteUser(2)).toBe(true)

      expect(await heldRows()).toHaveLength(0)
    })
  })

  describe('quiet hours', () => {
    beforeEach(async () => {
      await setUserSchedule(DISCORD_USER, {
        notify_quiet_hours_enabled: true,
        notify_quiet_hours_start: '22:00',
        notify_quiet_hours_end: '07:00',
        notify_timezone: 'UTC',
      })
    })

    it('holds overnight and delivers one digest when quiet hours end', async () => {
      const scheduler = createScheduler()

      clock = Date.parse('2027-05-01T23:00:00Z')
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      clock = Date.parse('2027-05-02T03:00:00Z')
      await scheduler.holdIfScheduled(movieRequest(DISCORD_USER, 'tmdb:9', 'Y'))

      const rows = await heldRows()
      expect(rows.map((row) => row.reason)).toEqual([
        'quiet_hours',
        'quiet_hours',
      ])

      clock = Date.parse('2027-05-02T06:59:00Z')
      await scheduler.flushDue()
      expect(channels.discordBot.sendDirectMessageEmbed).not.toHaveBeenCalled()

      clock = Date.parse('2027-05-02T07:00:00Z')
      await scheduler.flushDue()
      expect(channels.discordBot.sendDirectMessageEmbed).toHaveBeenCalledTimes(
        1,
      )
    })

    it('inherits the admin default quiet hours', async () => {
      await setUserSchedule(DISCORD_USER, {
        notify_quiet_hours_enabled: null,
        notify_quiet_hours_start: null,
        notify_quiet_hours_end: null,
        notify_timezone: null,
      })
      notificationDelivery = {
        quietHoursEnabled: true,
        quietHoursStart: '01:00',
        quietHoursEnd: '05:00',
        timezone: 'Asia/Tokyo',
      }

      // 18:00Z = 03:00 Tokyo → held until 05:00 Tokyo (20:00Z)
      clock = Date.parse('2027-05-01T18:00:00Z')
      await createScheduler().holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      const [row] = await heldRows()
      expect(new Date(row.deliver_after).toISOString()).toBe(
        '2027-05-01T20:00:00.000Z',
      )
    })
  })

  describe('schedule changes while held', () => {
    it('releases held rows once the user turns batching off', async () => {
      await setUserSchedule(DISCORD_USER, {
        notify_digest_mode: 'daily',
        notify_digest_time: '09:00',
        notify_timezone: 'UTC',
      })
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      // Still scheduled: nothing goes out before the digest time
      clock = T0 + MINUTE
      expect(await scheduler.flushDue()).toBe(0)

      await setUserSchedule(DISCORD_USER, { notify_digest_mode: 'off' })
      clock = T0 + 2 * MINUTE
      expect(await scheduler.flushDue()).toBe(1)

      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1)
      expect(await heldRows()).toHaveLength(0)
    })

    it('releases held rows once the admin turns the default off', async () => {
      notificationDelivery = { digestMode: 'window', digestWindowMinutes: 60 }
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      notificationDelivery = { digestMode: 'off' }
      clock = T0 + MINUTE
      expect(await scheduler.flushDue()).toBe(1)
      expect(await heldRows()).toHaveLength(0)
    })

    it('keeps holding while the schedule still applies', async () => {
      await setUserSchedule(DISCORD_USER, {
        notify_quiet_hours_enabled: true,
        notify_quiet_hours_start: '10:00',
        notify_quiet_hours_end: '14:00',
        notify_timezone: 'UTC',
      })
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      clock = T0 + 30 * MINUTE
      expect(await scheduler.flushDue()).toBe(0)
      expect(await heldRows()).toHaveLength(1)
    })
  })

  describe('restart safety', () => {
    beforeEach(async () => {
      await setUserSchedule(DISCORD_USER, { notify_digest_mode: 'window' })
    })

    it('delivers rows held before a restart', async () => {
      await createScheduler().holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      await createScheduler().holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 2),
      )

      // A fresh instance stands in for the restarted process
      clock = T0 + 15 * MINUTE
      const restarted = createScheduler()
      await restarted.start()
      await restarted.stop()

      expect(channels.discordBot.sendDirectMessageEmbed).toHaveBeenCalledTimes(
        1,
      )
      expect(await heldRows()).toHaveLength(0)
    })

    it('never resends when the process dies between send and mark', async () => {
      const first = createScheduler()
      await first.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      // The send goes out, then the process dies before the rows are cleared
      const deleteSpy = vi
        .spyOn(app.db, 'deleteHeldNotifications')
        .mockRejectedValueOnce(new Error('process killed'))
      clock = T0 + 15 * MINUTE
      await first.flushDue()
      deleteSpy.mockRestore()

      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1)
      const [stale] = await heldRows()
      expect(stale.claimed_at).not.toBeNull()

      const logger = createMockLogger()
      const restarted = createScheduler(logger)
      await restarted.start()
      await restarted.stop()

      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1)
      expect(await heldRows()).toHaveLength(0)
      expect(logger.warn).toHaveBeenCalledWith(
        { count: 1 },
        expect.stringContaining('interrupted'),
      )
    })

    it('does not drop rows that were not yet being delivered', async () => {
      const first = createScheduler()
      await first.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )

      // Crash before the window ends: row is unclaimed
      const restarted = createScheduler()
      await restarted.start()
      await restarted.stop()
      expect(await heldRows()).toHaveLength(1)

      clock = T0 + 15 * MINUTE
      await createScheduler().flushDue()
      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1)
    })

    it('does not start delivering after a shutdown that raced startup', async () => {
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      clock = T0 + 15 * MINUTE

      let finishCleanup: (count: number) => void = () => {}
      const cleanupSpy = vi
        .spyOn(app.db, 'deleteInterruptedHeldNotifications')
        .mockImplementationOnce(
          () =>
            new Promise<number>((resolve) => {
              finishCleanup = resolve
            }),
        )

      const starting = scheduler.start()
      // Shutdown arrives while startup is still clearing interrupted rows
      await scheduler.stop()
      finishCleanup(0)
      await starting
      cleanupSpy.mockRestore()

      // Nothing was claimed after shutdown, so the row survives for next start
      expect(channels.discordBot.sendDirectMessage).not.toHaveBeenCalled()
      const [row] = await heldRows()
      expect(row.claimed_at).toBeNull()
    })

    it('gives each row to only one of two overlapping flushes', async () => {
      const scheduler = createScheduler()
      await scheduler.holdIfScheduled(
        episodeRequest(DISCORD_USER, 'tvdb:1', 'Show X', 1, 1),
      )
      clock = T0 + 15 * MINUTE

      await Promise.all([
        scheduler.flushDue(),
        scheduler.flushDue(),
        createScheduler().flushDue(),
      ])

      expect(channels.discordBot.sendDirectMessage).toHaveBeenCalledTimes(1)
    })
  })
})
