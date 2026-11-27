import { PLEX_LABEL_SYNC_DEFAULTS } from '@root/schemas/plex/label-sync-config.schema.js'
import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema.js'
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
import { seedAll } from '../../helpers/seeds/index.js'

const TEST_JOB = 'scheduler-bugs-test-job'

describe('scheduler', () => {
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
    app.config.authenticationMethod = 'disabled'
  })

  afterEach(async () => {
    await app.scheduler.unscheduleJob(TEST_JOB)
    vi.restoreAllMocks()
  })

  const createTestJob = async (enabled: boolean) => {
    await app.db.createSchedule({
      name: TEST_JOB,
      type: 'interval',
      config: { hours: 1 },
      enabled,
      last_run: null,
    })
    const handler = vi.fn().mockResolvedValue(undefined)
    await app.scheduler.scheduleJob(TEST_JOB, handler)
    return handler
  }

  it('refuses an update whose type does not match the schedule', async () => {
    await createTestJob(true)

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/scheduler/schedules/${TEST_JOB}`,
      payload: { type: 'cron', config: { expression: '0 2 * * *' } },
    })

    expect(res.statusCode).toBe(400)
    expect(await app.db.getScheduleByName(TEST_JOB)).toMatchObject({
      type: 'interval',
      config: { hours: 1 },
    })
  })

  it('applies an update to the live job', async () => {
    await createTestJob(true)

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/scheduler/schedules/${TEST_JOB}`,
      payload: { type: 'interval', config: { minutes: 30 } },
    })
    const before = Date.now()
    const schedule = (
      await app.inject({
        method: 'GET',
        url: `/v1/scheduler/schedules/${TEST_JOB}`,
      })
    ).json()

    expect(res.statusCode).toBe(200)
    expect(schedule.config).toEqual({ minutes: 30 })
    const nextRun = new Date(schedule.next_run.time).getTime()
    expect(nextRun).toBeGreaterThan(before)
    expect(nextRun).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000)
  })

  it('stops a job disabled through the route', async () => {
    await createTestJob(true)

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/scheduler/schedules/${TEST_JOB}`,
      payload: { type: 'interval', enabled: false },
    })
    const schedule = (
      await app.inject({
        method: 'GET',
        url: `/v1/scheduler/schedules/${TEST_JOB}`,
      })
    ).json()

    expect(res.statusCode).toBe(200)
    expect(schedule.enabled).toBe(false)
    expect(schedule.next_run).toBeNull()
  })

  it('refuses to start a disabled job', async () => {
    const handler = await createTestJob(false)

    const res = await app.inject({
      method: 'POST',
      url: `/v1/scheduler/schedules/${TEST_JOB}/start`,
    })

    expect(res.statusCode).toBe(409)
    expect(handler).not.toHaveBeenCalled()
    expect((await app.db.getScheduleByName(TEST_JOB))?.last_run).toBeNull()
  })

  it('records a failing quota maintenance run as failed', async () => {
    await app.db.createSchedule({
      name: 'quota-maintenance',
      type: 'cron',
      config: { expression: '0 2 * * *' },
      enabled: true,
      last_run: null,
    })
    vi.spyOn(app.quotaService, 'performAllQuotaMaintenance').mockRejectedValue(
      new Error('boom'),
    )

    await app.scheduler.runJobNow('quota-maintenance')

    expect(
      (await app.db.getScheduleByName('quota-maintenance'))?.last_run?.status,
    ).toBe('failed')
  })

  it('records a failing plex label full sync run as failed', async () => {
    const labelSync = app.config.plexLabelSync
    app.config.plexLabelSync = { ...PLEX_LABEL_SYNC_DEFAULTS, enabled: true }
    await app.db.createSchedule({
      name: 'plex-label-full-sync',
      type: 'cron',
      config: { expression: '0 2 * * 0' },
      enabled: true,
      last_run: null,
    })
    vi.spyOn(app.plexLabelSyncService, 'syncAllLabels').mockRejectedValue(
      new Error('boom'),
    )

    try {
      await app.scheduler.runJobNow('plex-label-full-sync')
    } finally {
      app.config.plexLabelSync = labelSync
    }

    expect(
      (await app.db.getScheduleByName('plex-label-full-sync'))?.last_run,
    ).toMatchObject({ status: 'failed', error: 'boom' })
  })

  it('records a session poll that reported errors as failed', async () => {
    const monitoring = app.config.plexSessionMonitoring
    app.config.plexSessionMonitoring = {
      ...PLEX_SESSION_MONITORING_DEFAULTS,
      enabled: true,
    }
    await app.db.createSchedule({
      name: 'plex-session-monitor',
      type: 'interval',
      config: { minutes: 15 },
      enabled: true,
      last_run: null,
    })
    vi.spyOn(app.plexServerService, 'isSSEConnected').mockReturnValue(false)
    vi.spyOn(app.plexSessionMonitor, 'monitorSessions').mockResolvedValue({
      processedSessions: 0,
      triggeredSearches: 0,
      errors: ['Fatal error in session monitoring'],
      rollingUpdates: [],
    })

    try {
      await app.scheduler.runJobNow('plex-session-monitor')
    } finally {
      app.config.plexSessionMonitoring = monitoring
    }

    expect(
      (await app.db.getScheduleByName('plex-session-monitor'))?.last_run,
    ).toMatchObject({
      status: 'failed',
      error: 'Fatal error in session monitoring',
    })
  })

  it('runs the auto reset when its setting was never saved', async () => {
    const monitoring = app.config.plexSessionMonitoring
    app.config.plexSessionMonitoring = {
      enabled: true,
      pollingIntervalMinutes: 15,
      remainingEpisodes: 2,
    }
    await app.db.createSchedule({
      name: 'plex-rolling-auto-reset',
      type: 'interval',
      config: { hours: 24 },
      enabled: true,
      last_run: null,
    })
    const reset = vi
      .spyOn(app.plexSessionMonitor, 'resetInactiveRollingShows')
      .mockResolvedValue(undefined)

    try {
      await app.scheduler.runJobNow('plex-rolling-auto-reset')
    } finally {
      app.config.plexSessionMonitoring = monitoring
    }

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('reads unparseable run info as no run', async () => {
    await app.db.createSchedule({
      name: TEST_JOB,
      type: 'interval',
      config: { hours: 1 },
      enabled: false,
      last_run: null,
    })
    await getTestDatabase()('schedules')
      .where({ name: TEST_JOB })
      .update({ last_run: 'not json' })

    expect((await app.db.getScheduleByName(TEST_JOB))?.last_run).toBeNull()
  })
})
