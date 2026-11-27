import type { FastifyInstance } from 'fastify'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../helpers/database.js'

const POLLERS = [
  'pending-webhooks-processor',
  'pending-webhooks-cleanup',
  'pending-label-sync-processor',
  'pending-label-sync-cleanup',
]

describe('scheduler rows on first boot', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function boot(): Promise<FastifyInstance> {
    app = await build()
    await app.ready()
    return app
  }

  it('creates each plugin job from its default schedule', async () => {
    const booted = await boot()

    const expected = {
      'anime-update': {
        type: 'cron',
        config: { expression: '0 3 * * 0' },
        enabled: true,
      },
      'approval-maintenance': {
        type: 'cron',
        config: { expression: '0 */4 * * *' },
        enabled: true,
      },
      'maintainerr-sync': {
        type: 'interval',
        config: { hours: 1 },
        enabled: booted.maintainerr.isEnabled,
      },
      'metadata-refresh': {
        type: 'cron',
        config: { expression: '0 2 * * 0' },
        enabled: true,
      },
      'plex-label-full-sync': {
        type: 'cron',
        config: { expression: '0 2 * * 0' },
        enabled: false,
      },
      'quota-maintenance': {
        type: 'cron',
        config: { expression: '0 2 * * *' },
        enabled: true,
      },
      'update-check': {
        type: 'cron',
        config: { expression: '0 * * * *' },
        enabled: true,
      },
    }

    for (const [name, schedule] of Object.entries(expected)) {
      expect(await booted.db.getScheduleByName(name), name).toMatchObject(
        schedule,
      )
    }
  })

  it('creates the session monitor jobs switched off while the feature is off', async () => {
    const booted = await boot()

    expect(
      await booted.db.getScheduleByName('plex-session-monitor'),
    ).toMatchObject({
      type: 'interval',
      config: { minutes: 15 },
      enabled: false,
    })
    expect(
      await booted.db.getScheduleByName('plex-rolling-pilot-sync'),
    ).toMatchObject({ type: 'interval', config: { hours: 24 }, enabled: false })
  })

  describe('session monitoring settings', () => {
    const SESSION_JOBS = [
      'plex-session-monitor',
      'plex-rolling-auto-reset',
      'plex-rolling-pilot-sync',
    ]

    const saveSettings = (booted: FastifyInstance, enableAutoReset: boolean) =>
      booted.inject({
        method: 'PUT',
        url: '/v1/config',
        payload: {
          plexSessionMonitoring: {
            enabled: true,
            pollingIntervalMinutes: 15,
            remainingEpisodes: 2,
            enableAutoReset,
            inactivityResetDays: 7,
            autoResetIntervalHours: 24,
          },
        },
      })

    const liveJobs = async (booted: FastifyInstance) => {
      const live: string[] = []
      for (const name of SESSION_JOBS) {
        const schedule = await booted.scheduler.getSchedule(name)
        if (schedule?.enabled && schedule.next_run) live.push(name)
      }
      return live
    }

    it('start the auto reset job that a migration seeded disabled', async () => {
      await getTestDatabase()('schedules').insert({
        name: 'plex-rolling-auto-reset',
        type: 'interval',
        config: JSON.stringify({ hours: 24 }),
        enabled: false,
      })
      const booted = await boot()
      booted.config.authenticationMethod = 'disabled'
      expect(await liveJobs(booted)).toEqual([])

      const res = await saveSettings(booted, true)

      expect(res.statusCode).toBe(200)
      await vi.waitFor(async () => {
        expect(await liveJobs(booted)).toEqual(SESSION_JOBS)
      })
    })

    it('apply the other jobs when one schedule cannot be applied', async () => {
      const booted = await boot()
      booted.config.plexSessionMonitoring = {
        enabled: true,
        pollingIntervalMinutes: 5,
        remainingEpisodes: 2,
        enableAutoReset: true,
        autoResetIntervalHours: 6,
      }
      const update = booted.scheduler.updateJobSchedule.bind(booted.scheduler)
      vi.spyOn(booted.scheduler, 'updateJobSchedule').mockImplementation(
        async (name, ...rest) =>
          name === 'plex-session-monitor' ? 'unknown' : update(name, ...rest),
      )

      await expect(
        booted.plexSessionMonitor.applyJobSchedules(),
      ).rejects.toThrow()

      expect(
        (await booted.db.getScheduleByName('plex-rolling-auto-reset'))?.config,
      ).toEqual({ hours: 6 })
      expect(
        (await booted.db.getScheduleByName('plex-rolling-pilot-sync'))?.config,
      ).toEqual({ hours: 6 })
    })

    it('stop only the auto reset job when auto reset is turned off', async () => {
      const booted = await boot()
      booted.config.authenticationMethod = 'disabled'
      await saveSettings(booted, true)
      await vi.waitFor(async () => {
        expect(await liveJobs(booted)).toEqual(SESSION_JOBS)
      })

      await saveSettings(booted, false)

      await vi.waitFor(async () => {
        expect(await liveJobs(booted)).toEqual([
          'plex-session-monitor',
          'plex-rolling-pilot-sync',
        ])
      })
    })
  })

  it('leaves the rows that migrations seed disabled as they are', async () => {
    const seeded = [
      {
        name: 'delete-sync',
        type: 'cron',
        config: JSON.stringify({ expression: '0 1 * * 0' }),
        enabled: false,
      },
      {
        name: 'plex-rolling-auto-reset',
        type: 'interval',
        config: JSON.stringify({ hours: 24 }),
        enabled: false,
      },
    ]
    await getTestDatabase()('schedules').insert(seeded)

    const booted = await boot()

    for (const { name } of seeded) {
      const schedule = await booted.scheduler.getSchedule(name)
      expect(Boolean(schedule?.enabled), name).toBe(false)
      expect(schedule?.next_run, name).toBeNull()
    }
  })

  it('boots when a stored schedule cannot start', async () => {
    await getTestDatabase()('schedules').insert({
      name: 'quota-maintenance',
      type: 'cron',
      config: JSON.stringify({ expression: 'not a cron' }),
      enabled: true,
    })

    const booted = await boot()

    const schedule = await booted.scheduler.getSchedule('quota-maintenance')
    expect(schedule?.config).toEqual({ expression: 'not a cron' })
    expect(schedule?.next_run).toBeNull()
  })

  it('catches up an overdue interval job only once the server is listening', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    await getTestDatabase()('schedules').insert({
      name: 'maintainerr-sync',
      type: 'interval',
      config: JSON.stringify({ hours: 1 }),
      enabled: true,
      last_run: JSON.stringify({ time: twoDaysAgo, status: 'completed' }),
    })
    const lastRunTime = async (booted: FastifyInstance) =>
      (await booted.db.getScheduleByName('maintainerr-sync'))?.last_run?.time

    const booted = await boot()
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(await lastRunTime(booted)).toBe(twoDaysAgo)

    await booted.listen({ port: 0, host: '127.0.0.1' })

    await vi.waitFor(async () => {
      expect(await lastRunTime(booted)).not.toBe(twoDaysAgo)
    })
  })

  it('creates no row for the internal pollers', async () => {
    await boot()

    expect(
      await getTestDatabase()('schedules').whereIn('name', POLLERS),
    ).toEqual([])
  })

  it('applies a new session monitoring interval without a restart', async () => {
    const booted = await boot()
    booted.config.authenticationMethod = 'disabled'

    const res = await booted.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: {
        plexSessionMonitoring: {
          enabled: false,
          pollingIntervalMinutes: 5,
          remainingEpisodes: 2,
          autoResetIntervalHours: 6,
        },
      },
    })

    expect(res.statusCode).toBe(200)
    await vi.waitFor(async () => {
      expect(
        (await booted.db.getScheduleByName('plex-session-monitor'))?.config,
      ).toEqual({ minutes: 5 })
      expect(
        (await booted.db.getScheduleByName('plex-rolling-auto-reset'))?.config,
      ).toEqual({ hours: 6 })
      expect(
        (await booted.db.getScheduleByName('plex-rolling-pilot-sync'))?.config,
      ).toEqual({ hours: 6 })
    })
  })
})
