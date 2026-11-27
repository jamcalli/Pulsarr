import type { IntervalConfig, JobRunInfo } from '@root/types/scheduler.types.js'
import { SchedulerService } from '@services/scheduler.service.js'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import { createScheduleDb, type ScheduleDb } from '../../mocks/schedule-db.js'

const JOB = 'test-job'
const NOW = new Date('2026-01-15T12:00:00.000Z')
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * HOUR).toISOString()

const completedRun = (time: string): JobRunInfo => ({
  time,
  status: 'completed',
})

describe('SchedulerService', () => {
  let db: ScheduleDb
  let scheduler: SchedulerService

  const createScheduler = (rows: Parameters<typeof createScheduleDb>[0]) => {
    db = createScheduleDb(rows)
    scheduler = new SchedulerService(createMockLogger(), {
      db,
      progress: { hasActiveConnections: () => false, emit: vi.fn() },
    } as unknown as FastifyInstance)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    scheduler.stop()
    vi.useRealTimers()
  })

  describe('catching up an overdue interval job', () => {
    const intervalRow = (lastRun: JobRunInfo | null) => ({
      name: JOB,
      type: 'interval' as const,
      config: { hours: 24 },
      enabled: true,
      last_run: lastRun,
      next_run: null,
    })

    it('runs once the app has started when its last run is older than the interval', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(30)))])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('does not run before the app has started', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(30)))])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
    })

    it('runs at registration when the app has already started', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(30)))])
      const handler = vi.fn().mockResolvedValue(undefined)

      scheduler.runCatchUps()
      await scheduler.scheduleJob(JOB, handler)
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('skips the catch-up when the job already ran before the app started', async () => {
      createScheduler([
        { ...intervalRow(completedRun(hoursAgo(30))), config: { minutes: 1 } },
      ])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await vi.advanceTimersByTimeAsync(MINUTE)
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('does not catch up a job that was disabled before the app started', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(30)))])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await scheduler.updateJobSchedule(JOB, null, false)
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
    })

    it('skips the catch-up when a longer interval set before start is not overdue', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(30)))])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await scheduler.updateJobSchedule(JOB, { hours: 48 })
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
    })

    it('keeps the next run on the original timer after catching up', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(30)))])

      await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))
      await vi.advanceTimersByTimeAsync(HOUR)
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      const nextRun = (await scheduler.getSchedule(JOB))?.next_run?.time
      expect(nextRun).toBe(new Date(NOW.getTime() + 24 * HOUR).toISOString())
    })

    it('waits when the last run is within the interval', async () => {
      createScheduler([intervalRow(completedRun(hoursAgo(2)))])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
    })

    it('does not catch up when a disabled job is switched on later', async () => {
      createScheduler([
        { ...intervalRow(completedRun(hoursAgo(30))), enabled: false },
      ])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      scheduler.runCatchUps()
      await scheduler.updateJobSchedule(JOB, null, true)
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
    })

    it('waits when the job has never run', async () => {
      createScheduler([intervalRow(null)])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      scheduler.runCatchUps()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
    })
  })

  it('keeps the running timer when an update changes nothing', async () => {
    createScheduler([
      {
        name: JOB,
        type: 'interval',
        config: { hours: 1 },
        enabled: true,
        last_run: null,
        next_run: null,
      },
    ])
    const handler = vi.fn().mockResolvedValue(undefined)

    await scheduler.scheduleJob(JOB, handler)
    await vi.advanceTimersByTimeAsync(50 * MINUTE)
    await scheduler.updateJobSchedule(JOB, null, true)
    await vi.advanceTimersByTimeAsync(15 * MINUTE)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  describe('updating a schedule', () => {
    const hourlyRow = (enabled: boolean) => ({
      name: JOB,
      type: 'interval' as const,
      config: { hours: 1 },
      enabled,
      last_run: null,
      next_run: null,
    })

    it('applies overlapping updates in the order they were made', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)
      await scheduler.scheduleJob(JOB, handler)

      const disabling = scheduler.updateJobSchedule(JOB, null, false)
      const enabling = scheduler.updateJobSchedule(JOB, null, true)
      await Promise.all([disabling, enabling])
      await vi.advanceTimersByTimeAsync(HOUR)

      expect((await db.getScheduleByName(JOB))?.enabled).toBe(true)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('keeps the previous timer and throws when the update cannot be saved', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)
      await scheduler.scheduleJob(JOB, handler)
      db.updateSchedule.mockResolvedValueOnce(false)

      await expect(
        scheduler.updateJobSchedule(JOB, { minutes: 10 }),
      ).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(10 * MINUTE)
      expect(handler).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(50 * MINUTE)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('keeps the old timer on its cadence when an update fails late in the cycle', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)
      await scheduler.scheduleJob(JOB, handler)
      await vi.advanceTimersByTimeAsync(59 * MINUTE)
      db.updateSchedule.mockResolvedValueOnce(false)

      await expect(
        scheduler.updateJobSchedule(JOB, { hours: 2 }),
      ).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(MINUTE)

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('does not run the new schedule before it is saved', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)
      await scheduler.scheduleJob(JOB, handler)
      db.updateSchedule.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5 * SECOND))
        return false
      })

      const update = scheduler.updateJobSchedule(JOB, { seconds: 1 })
      const outcome = expect(update).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(5 * SECOND)
      await outcome

      expect(handler).not.toHaveBeenCalled()
    })

    it('does not start a second run when the timer is replaced during a run', async () => {
      createScheduler([hourlyRow(true)])
      let finish: () => void = () => {}
      const handler = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      await scheduler.scheduleJob(JOB, handler)
      await vi.advanceTimersByTimeAsync(HOUR)

      await scheduler.updateJobSchedule(JOB, { minutes: 1 })
      await vi.advanceTimersByTimeAsync(5 * MINUTE)
      expect(handler).toHaveBeenCalledTimes(1)

      finish()
      await vi.advanceTimersByTimeAsync(MINUTE)
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('leaves a job unscheduled when it was removed while an update was saving', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)
      await scheduler.scheduleJob(JOB, handler)
      db.updateSchedule.mockImplementationOnce(async () => {
        await scheduler.unscheduleJob(JOB)
        return true
      })

      await scheduler.updateJobSchedule(JOB, { minutes: 1 })
      await vi.advanceTimersByTimeAsync(5 * MINUTE)

      expect(handler).not.toHaveBeenCalled()
    })

    it('still accepts an update after one that failed', async () => {
      createScheduler([hourlyRow(true)])
      await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))
      db.updateSchedule.mockResolvedValueOnce(false)
      await expect(
        scheduler.updateJobSchedule(JOB, { minutes: 10 }),
      ).rejects.toThrow()

      await scheduler.updateJobSchedule(JOB, { minutes: 20 })

      expect((await db.getScheduleByName(JOB))?.config).toEqual({
        minutes: 20,
      })
    })

    it('reports the next tick after one was skipped for a long run', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 90 * MINUTE)),
      )
      await scheduler.scheduleJob(JOB, handler)

      await vi.advanceTimersByTimeAsync(2 * HOUR + 31 * MINUTE)

      expect(handler).toHaveBeenCalledTimes(1)
      expect((await scheduler.getSchedule(JOB))?.next_run?.time).toBe(
        new Date(NOW.getTime() + 3 * HOUR).toISOString(),
      )
    })

    it('runs on the new interval once the config changes', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await scheduler.updateJobSchedule(JOB, { minutes: 10 })
      await vi.advanceTimersByTimeAsync(10 * MINUTE)

      expect(handler).toHaveBeenCalledTimes(1)
      expect((await db.getScheduleByName(JOB))?.config).toEqual({
        minutes: 10,
      })
    })

    it('stops running once the job is disabled', async () => {
      createScheduler([hourlyRow(true)])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await scheduler.updateJobSchedule(JOB, null, false)
      await vi.advanceTimersByTimeAsync(2 * HOUR)

      expect(handler).not.toHaveBeenCalled()
      expect((await db.getScheduleByName(JOB))?.enabled).toBe(false)
    })

    it('starts running once the job is enabled', async () => {
      createScheduler([hourlyRow(false)])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await scheduler.updateJobSchedule(JOB, null, true)
      await vi.advanceTimersByTimeAsync(HOUR)

      expect(handler).toHaveBeenCalledTimes(1)
      expect((await scheduler.getSchedule(JOB))?.next_run).not.toBeNull()
    })
  })

  it('moves the next run into the future after a failed run', async () => {
    createScheduler([
      {
        name: JOB,
        type: 'interval',
        config: { hours: 1 },
        enabled: true,
        last_run: null,
        next_run: { time: hoursAgo(1), status: 'pending', estimated: true },
      },
    ])
    const handler = vi.fn().mockRejectedValue(new Error('boom'))

    await scheduler.scheduleJob(JOB, handler)
    await vi.advanceTimersByTimeAsync(HOUR)

    const row = await scheduler.getSchedule(JOB)
    expect(row?.last_run?.status).toBe('failed')
    expect(new Date(row?.next_run?.time ?? 0).getTime()).toBeGreaterThan(
      Date.now(),
    )
  })

  it('reports no next run for a disabled job', async () => {
    createScheduler([
      {
        name: JOB,
        type: 'cron',
        config: { expression: '0 2 * * *' },
        enabled: false,
        last_run: null,
        next_run: {
          time: '2026-01-16T02:00:00.000Z',
          status: 'pending',
          estimated: true,
        },
      },
    ])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))

    expect((await scheduler.getSchedule(JOB))?.next_run).toBeNull()
  })

  it('records a finished run with one write', async () => {
    createScheduler([
      {
        name: JOB,
        type: 'interval',
        config: { minutes: 1 },
        enabled: true,
        last_run: null,
        next_run: null,
      },
    ])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))
    db.updateSchedule.mockClear()
    await vi.advanceTimersByTimeAsync(MINUTE)

    expect(db.updateSchedule).toHaveBeenCalledTimes(1)
  })

  const intervalRow = (
    config: IntervalConfig,
    overrides: { enabled?: boolean; last_run?: JobRunInfo | null } = {},
  ) => ({
    name: JOB,
    type: 'interval' as const,
    config,
    enabled: true,
    last_run: null,
    next_run: null,
    ...overrides,
  })

  it('catches up once when the job is recreated straight after registration', async () => {
    createScheduler([
      intervalRow({ hours: 24 }, { last_run: completedRun(hoursAgo(30)) }),
    ])
    const handler = vi.fn().mockResolvedValue(undefined)

    await scheduler.scheduleJob(JOB, handler)
    await scheduler.updateJobSchedule(JOB, { hours: 12 }, true)
    scheduler.runCatchUps()
    await vi.advanceTimersByTimeAsync(SECOND)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('creates a missing row from the default schedule', async () => {
    createScheduler([])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined), {
      defaultSchedule: { type: 'cron', config: { expression: '0 2 * * 0' } },
    })

    expect(await db.getScheduleByName(JOB)).toMatchObject({
      type: 'cron',
      config: { expression: '0 2 * * 0' },
      enabled: true,
      last_run: null,
    })
  })

  it('leaves an existing row alone when a default schedule is given', async () => {
    createScheduler([intervalRow({ hours: 6 }, { enabled: false })])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined), {
      defaultSchedule: { type: 'cron', config: { expression: '0 2 * * 0' } },
    })

    expect(db.createSchedule).not.toHaveBeenCalled()
    expect(await db.getScheduleByName(JOB)).toMatchObject({
      type: 'interval',
      config: { hours: 6 },
      enabled: false,
    })
  })

  it('creates an enabled 24 hour interval row when no default is given', async () => {
    createScheduler([])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))

    expect(await db.getScheduleByName(JOB)).toMatchObject({
      type: 'interval',
      config: { hours: 24 },
      enabled: true,
      last_run: null,
      next_run: null,
    })
  })

  it('replaces the row with the given schedule and runs on it', async () => {
    createScheduler([
      {
        name: JOB,
        type: 'cron',
        config: { expression: '0 2 * * *' },
        enabled: true,
        last_run: null,
        next_run: null,
      },
    ])
    const handler = vi.fn().mockResolvedValue(undefined)

    await scheduler.scheduleJob(JOB, handler, {
      schedule: { type: 'interval', config: { minutes: 5 } },
    })
    await vi.advanceTimersByTimeAsync(5 * MINUTE)

    expect(await db.getScheduleByName(JOB)).toMatchObject({
      type: 'interval',
      config: { minutes: 5 },
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('switches an existing row on when the given schedule says enabled', async () => {
    createScheduler([intervalRow({ minutes: 5 }, { enabled: false })])
    const handler = vi.fn().mockResolvedValue(undefined)

    await scheduler.scheduleJob(JOB, handler, {
      schedule: { type: 'interval', config: { minutes: 5 }, enabled: true },
    })
    await vi.advanceTimersByTimeAsync(5 * MINUTE)

    expect((await db.getScheduleByName(JOB))?.enabled).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('switches an existing row off when the given schedule says disabled', async () => {
    createScheduler([intervalRow({ minutes: 5 })])
    const handler = vi.fn().mockResolvedValue(undefined)

    await scheduler.scheduleJob(JOB, handler, {
      schedule: { type: 'interval', config: { minutes: 5 }, enabled: false },
    })
    await vi.advanceTimersByTimeAsync(5 * MINUTE)

    expect((await db.getScheduleByName(JOB))?.enabled).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('starts no timer when the given schedule cannot be saved', async () => {
    createScheduler([intervalRow({ minutes: 5 })])
    const handler = vi.fn().mockResolvedValue(undefined)
    db.updateSchedule.mockResolvedValueOnce(false)

    await expect(
      scheduler.scheduleJob(JOB, handler, {
        schedule: { type: 'interval', config: { minutes: 1 } },
      }),
    ).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(5 * MINUTE)

    expect(handler).not.toHaveBeenCalled()
  })

  it('leaves the enabled flag alone when the given schedule does not set it', async () => {
    createScheduler([intervalRow({ minutes: 5 }, { enabled: false })])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined), {
      schedule: { type: 'interval', config: { minutes: 10 } },
    })

    expect(await db.getScheduleByName(JOB)).toMatchObject({
      config: { minutes: 10 },
      enabled: false,
    })
  })

  it('runs an internal job on its interval without touching the database', async () => {
    createScheduler([])
    const handler = vi.fn().mockResolvedValue(undefined)

    scheduler.scheduleInternalJob(JOB, { seconds: 30 }, handler)
    await vi.advanceTimersByTimeAsync(MINUTE)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(db.getScheduleByName).not.toHaveBeenCalled()
    expect(db.createSchedule).not.toHaveBeenCalled()
    expect(db.updateSchedule).not.toHaveBeenCalled()
  })

  it('stops an internal job when it is unscheduled', async () => {
    createScheduler([])
    const handler = vi.fn().mockResolvedValue(undefined)

    scheduler.scheduleInternalJob(JOB, { seconds: 30 }, handler)
    await scheduler.unscheduleJob(JOB)
    await vi.advanceTimersByTimeAsync(MINUTE)

    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses an update for another schedule type and leaves the row', async () => {
    createScheduler([intervalRow({ hours: 1 })])
    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))
    db.updateSchedule.mockClear()

    const outcome = await scheduler.updateJobSchedule(
      JOB,
      { expression: '0 2 * * *' },
      undefined,
      'cron',
    )

    expect(outcome).toBe('type-mismatch')
    expect(db.updateSchedule).not.toHaveBeenCalled()
    expect(await db.getScheduleByName(JOB)).toMatchObject({
      type: 'interval',
      config: { hours: 1 },
    })
  })

  it('keeps the row and the running job when the new interval cannot start', async () => {
    createScheduler([intervalRow({ hours: 1 })])
    const handler = vi.fn().mockResolvedValue(undefined)
    await scheduler.scheduleJob(JOB, handler)

    await expect(
      scheduler.updateJobSchedule(JOB, { days: 30 }),
    ).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(HOUR)

    expect(await db.getScheduleByName(JOB)).toMatchObject({
      config: { hours: 1 },
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  describe('registering a job whose stored schedule cannot start', () => {
    it('keeps the job registered so a valid schedule can start it later', async () => {
      createScheduler([
        {
          name: JOB,
          type: 'cron',
          config: { expression: 'not a cron' },
          enabled: true,
          last_run: null,
          next_run: null,
        },
      ])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      expect((await scheduler.getSchedule(JOB))?.next_run).toBeNull()

      await scheduler.updateJobSchedule(JOB, { expression: '0 2 * * *' })
      expect((await scheduler.getSchedule(JOB))?.next_run).not.toBeNull()
    })

    it('does not run an interval job stored with no time units', async () => {
      createScheduler([intervalRow({})])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      db.updateSchedule.mockClear()
      await vi.advanceTimersByTimeAsync(SECOND)

      expect(handler).not.toHaveBeenCalled()
      expect(db.updateSchedule).not.toHaveBeenCalled()
    })

    it('does not run an interval job stored with an interval too long to schedule', async () => {
      createScheduler([intervalRow({ days: 40 })])
      const handler = vi.fn().mockResolvedValue(undefined)

      await scheduler.scheduleJob(JOB, handler)
      await vi.advanceTimersByTimeAsync(HOUR)

      expect(handler).not.toHaveBeenCalled()
      expect((await scheduler.getSchedule(JOB))?.next_run).toBeNull()
    })
  })

  it('reports a future next run for an enabled cron job', async () => {
    createScheduler([
      {
        name: JOB,
        type: 'cron',
        config: { expression: '0 2 * * *' },
        enabled: true,
        last_run: null,
        next_run: null,
      },
    ])

    await scheduler.scheduleJob(JOB, vi.fn().mockResolvedValue(undefined))

    const nextRun = (await scheduler.getSchedule(JOB))?.next_run
    expect(nextRun).toMatchObject({ status: 'pending', estimated: true })
    expect(new Date(nextRun?.time ?? 0).getTime()).toBeGreaterThan(Date.now())
  })

  it('records a throwing handler as failed with its message', async () => {
    createScheduler([intervalRow({ hours: 1 })])
    await scheduler.scheduleJob(
      JOB,
      vi.fn().mockRejectedValue(new Error('boom')),
    )

    expect(await scheduler.runJobNow(JOB)).toBe('failed')
    expect((await db.getScheduleByName(JOB))?.last_run).toMatchObject({
      status: 'failed',
      error: 'boom',
    })
  })

  it('refuses to run a disabled job and writes nothing', async () => {
    createScheduler([intervalRow({ hours: 1 }, { enabled: false })])
    const handler = vi.fn().mockResolvedValue(undefined)
    await scheduler.scheduleJob(JOB, handler)
    db.updateSchedule.mockClear()

    expect(await scheduler.runJobNow(JOB)).toBe('disabled')
    expect(handler).not.toHaveBeenCalled()
    expect(db.updateSchedule).not.toHaveBeenCalled()
  })
})
