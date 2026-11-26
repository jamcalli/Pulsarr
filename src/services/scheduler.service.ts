import { isDeepStrictEqual } from 'node:util'
import { intervalToMs } from '@root/schemas/scheduler/scheduler.schema.js'
import type { ProgressEvent } from '@root/types/progress.types.js'
import type {
  CronConfig,
  DbSchedule,
  DeclaredSchedule,
  IntervalConfig,
  JobRunInfo,
  ScheduleSpec,
} from '@root/types/scheduler.types.js'
import { errorMessage } from '@utils/error-message.js'
import { createServiceLogger } from '@utils/logger.js'
import { Cron } from 'croner'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  AsyncTask,
  CronJob,
  SimpleIntervalJob,
  ToadScheduler,
} from 'toad-scheduler'

type JobHandler = (jobName: string) => Promise<void>

interface ScheduleJobOptions {
  /** Used only when the job has no row yet. */
  defaultSchedule?: DeclaredSchedule
  /** Written to the row on every registration, for jobs whose timing or enabled state comes from app config. */
  schedule?: DeclaredSchedule
}

type RunOutcome = 'completed' | 'failed'

type ScheduleWithRunState = DbSchedule & { running: boolean }

interface LiveJob {
  job: SimpleIntervalJob | CronJob
  spec: ScheduleSpec
}

interface Registration {
  handler: JobHandler
  live: LiveJob | null
}

const FALLBACK_SCHEDULE: DeclaredSchedule = {
  type: 'interval',
  config: { hours: 24 },
  enabled: true,
}

export class SchedulerService {
  private readonly scheduler = new ToadScheduler()
  private readonly jobs = new Map<string, Registration>()
  private readonly internalJobs = new Set<string>()
  /** Names registered in this process, since only a first registration may catch up an overdue run. */
  private readonly registeredJobs = new Set<string>()
  /** Overdue jobs held until every plugin has started, since a handler may use a service that starts later. */
  private readonly pendingCatchUps = new Set<string>()
  private readonly jobsRunSinceBoot = new Set<string>()
  private appStarted = false
  private readonly nextIntervalFire = new Map<string, number>()
  /** Runs in progress per job, since a manual run can overlap a scheduled one. */
  private readonly runningJobs = new Map<string, number>()
  private readonly log: FastifyBaseLogger

  constructor(
    baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'SCHEDULER')
  }

  async scheduleJob(
    name: string,
    handler: JobHandler,
    options: ScheduleJobOptions = {},
  ): Promise<void> {
    const row = await this.ensureRow(name, options)
    this.stopLiveJob(name)
    this.jobs.set(name, { handler, live: null })
    const firstRegistration = !this.registeredJobs.has(name)
    this.registeredJobs.add(name)
    if (!row.enabled) return
    try {
      this.startLiveJob(name, row.spec, handler)
    } catch (error) {
      this.log.error(
        { error },
        `Job ${name} is registered but its stored schedule cannot start`,
      )
      return
    }
    if (firstRegistration && isOverdue(row.spec, row.lastRun)) {
      this.pendingCatchUps.add(name)
      if (this.appStarted) this.runCatchUps()
    }
  }

  /** Runs each overdue interval job once, and from then on a job registered overdue catches up at registration. */
  runCatchUps(): void {
    this.appStarted = true
    for (const name of this.pendingCatchUps) {
      const live = this.jobs.get(name)?.live
      if (
        !(live?.job instanceof SimpleIntervalJob) ||
        this.jobsRunSinceBoot.has(name)
      ) {
        continue
      }
      const nextFire = this.nextIntervalFire.get(name)
      void live.job.executeAsync()
      if (nextFire !== undefined) this.nextIntervalFire.set(name, nextFire)
    }
    this.pendingCatchUps.clear()
  }

  scheduleInternalJob(
    name: string,
    interval: IntervalConfig,
    handler: () => Promise<void>,
  ): void {
    this.scheduler.removeById(name)
    const task = new AsyncTask(name, handler, (error) => {
      this.log.error({ error }, `Internal job ${name} failed`)
    })
    const job = new SimpleIntervalJob(interval, task, {
      id: name,
      preventOverrun: true,
    })
    this.addToScheduler(name, () => this.scheduler.addSimpleIntervalJob(job))
    this.internalJobs.add(name)
  }

  async unscheduleJob(name: string): Promise<boolean> {
    const known = this.jobs.has(name) || this.internalJobs.has(name)
    this.scheduler.removeById(name)
    this.nextIntervalFire.delete(name)
    this.jobs.delete(name)
    this.internalJobs.delete(name)
    return known
  }

  async updateJobSchedule(
    name: string,
    config: IntervalConfig | CronConfig | null,
    enabled?: boolean,
    expectedType?: DbSchedule['type'],
  ): Promise<'updated' | 'unknown' | 'type-mismatch'> {
    const row = await this.fastify.db.getScheduleByName(name)
    if (!row) return 'unknown'
    if (expectedType !== undefined && expectedType !== row.type) {
      return 'type-mismatch'
    }

    const configChanged =
      config !== null && !isDeepStrictEqual(config, row.config)
    const enabledChanged = enabled !== undefined && enabled !== row.enabled
    if (!configChanged && !enabledChanged) return 'updated'

    const nextSpec = configChanged ? specForType(row.type, config) : row
    if (!nextSpec) return 'type-mismatch'

    const registration = this.jobs.get(name)
    if (registration) {
      const wasLive = registration.live !== null
      this.stopLiveJob(name)
      if (enabled ?? row.enabled) {
        try {
          this.startLiveJob(name, nextSpec, registration.handler)
        } catch (error) {
          if (wasLive) {
            this.startLiveJob(name, row, registration.handler)
          }
          throw error
        }
      }
    }

    await this.fastify.db.updateSchedule(name, {
      config: configChanged ? nextSpec.config : undefined,
      enabled: enabledChanged ? enabled : undefined,
    })
    return 'updated'
  }

  async runJobNow(name: string): Promise<RunOutcome | 'unknown' | 'disabled'> {
    const gate = await this.runGate(name)
    if (typeof gate === 'string') return gate
    return this.runJob(name, gate)
  }

  /** Runs a job without waiting for it. */
  async startJob(
    name: string,
  ): Promise<'started' | 'running' | 'unknown' | 'disabled'> {
    const gate = await this.runGate(name)
    if (typeof gate === 'string') return gate
    if (this.isJobRunning(name)) return 'running'
    this.runJob(name, gate).catch((error) => {
      this.log.error({ error }, `Error recording the run of job ${name}`)
    })
    return 'started'
  }

  async getSchedule(name: string): Promise<ScheduleWithRunState | null> {
    const schedule = await this.fastify.db.getScheduleByName(name)
    if (!schedule) return null
    return {
      ...schedule,
      next_run: schedule.enabled ? this.nextRun(name) : null,
      running: this.isJobRunning(name),
    }
  }

  async logReadiness(): Promise<void> {
    try {
      const rows = await this.fastify.db.getAllSchedules()
      const active = [...this.jobs.values()].filter((job) => job.live).length
      this.log.info(
        `Scheduler ready: ${active + this.internalJobs.size} jobs active`,
      )
      const orphaned = rows
        .filter((row) => row.enabled && !this.jobs.has(row.name))
        .map((row) => row.name)
      if (orphaned.length > 0) {
        this.log.warn(
          { jobs: orphaned },
          'Enabled schedules have no registered handler',
        )
      }
    } catch (error) {
      this.log.error({ error }, 'Error reading schedules for the ready log')
    }
  }

  stop(): void {
    this.scheduler.stop()
  }

  private async ensureRow(
    name: string,
    options: ScheduleJobOptions,
  ): Promise<{
    spec: ScheduleSpec
    enabled: boolean
    lastRun: JobRunInfo | null
  }> {
    const existing = await this.fastify.db.getScheduleByName(name)
    const forced = options.schedule

    if (existing) {
      const specChanged = forced !== undefined && !sameSpec(existing, forced)
      const enabled = forced?.enabled ?? existing.enabled
      if (specChanged || enabled !== existing.enabled) {
        await this.fastify.db.updateSchedule(name, {
          type: specChanged ? forced.type : undefined,
          config: specChanged ? forced.config : undefined,
          enabled: enabled !== existing.enabled ? enabled : undefined,
        })
      }
      return {
        spec: specChanged ? forced : existing,
        enabled,
        lastRun: existing.last_run,
      }
    }

    const initial: DeclaredSchedule =
      forced ?? options.defaultSchedule ?? FALLBACK_SCHEDULE
    const enabled = initial.enabled ?? true
    await this.fastify.db.createSchedule({
      name,
      type: initial.type,
      config: initial.config,
      enabled,
      last_run: null,
    })
    return { spec: initial, enabled, lastRun: null }
  }

  private startLiveJob(
    name: string,
    spec: ScheduleSpec,
    handler: JobHandler,
  ): void {
    let job: SimpleIntervalJob | CronJob

    if (spec.type === 'interval') {
      const intervalMs = intervalToMs(spec.config)
      if (intervalMs <= 0) {
        throw new Error(`Schedule ${name} has an interval with no time units`)
      }
      const task = this.buildTask(name, handler, () => {
        this.nextIntervalFire.set(name, Date.now() + intervalMs)
      })
      const interval = new SimpleIntervalJob(spec.config, task, {
        id: name,
        preventOverrun: true,
      })
      this.nextIntervalFire.set(name, Date.now() + intervalMs)
      this.addToScheduler(name, () =>
        this.scheduler.addSimpleIntervalJob(interval),
      )
      job = interval
    } else {
      const cron = new CronJob(
        { cronExpression: spec.config.expression },
        this.buildTask(name, handler),
        { id: name, preventOverrun: true },
      )
      this.addToScheduler(name, () => this.scheduler.addCronJob(cron))
      job = cron
    }

    this.jobs.set(name, { handler, live: { job, spec } })
  }

  private stopLiveJob(name: string): void {
    this.scheduler.removeById(name)
    this.nextIntervalFire.delete(name)
    const registration = this.jobs.get(name)
    if (registration) registration.live = null
  }

  private addToScheduler(name: string, add: () => void): void {
    try {
      add()
    } catch (error) {
      this.scheduler.removeById(name)
      this.nextIntervalFire.delete(name)
      throw error
    }
  }

  private buildTask(
    name: string,
    handler: JobHandler,
    onFire?: () => void,
  ): AsyncTask {
    return new AsyncTask(
      `${name}-task`,
      async () => {
        onFire?.()
        await this.runJob(name, handler)
      },
      (error) => {
        this.log.error({ error }, `Error recording the run of job ${name}`)
      },
    )
  }

  private async runGate(
    name: string,
  ): Promise<JobHandler | 'unknown' | 'disabled'> {
    const registration = this.jobs.get(name)
    if (!registration) return 'unknown'
    const row = await this.fastify.db.getScheduleByName(name)
    if (!row) return 'unknown'
    if (!row.enabled) return 'disabled'
    return registration.handler
  }

  private runJob(name: string, handler: JobHandler): Promise<RunOutcome> {
    this.jobsRunSinceBoot.add(name)
    return this.trackRun(name, async () => {
      let lastRun: JobRunInfo
      try {
        await handler(name)
        lastRun = { time: new Date().toISOString(), status: 'completed' }
      } catch (error) {
        this.log.error({ error }, `Error in job ${name}`)
        lastRun = {
          time: new Date().toISOString(),
          status: 'failed',
          error: errorMessage(error),
        }
      }
      await this.fastify.db.updateSchedule(name, { last_run: lastRun })
      return lastRun.status === 'completed' ? 'completed' : 'failed'
    })
  }

  private nextRun(name: string): JobRunInfo | null {
    const live = this.jobs.get(name)?.live
    if (!live) return null
    const next =
      live.spec.type === 'interval'
        ? this.nextIntervalFire.get(name)
        : new Cron(live.spec.config.expression).nextRun()?.getTime()
    if (next === undefined) return null
    return {
      time: new Date(next).toISOString(),
      status: 'pending',
      estimated: true,
    }
  }

  private isJobRunning(name: string): boolean {
    return (this.runningJobs.get(name) ?? 0) > 0
  }

  private async trackRun(
    name: string,
    work: () => Promise<RunOutcome>,
  ): Promise<RunOutcome> {
    this.runningJobs.set(name, (this.runningJobs.get(name) ?? 0) + 1)
    this.emitJobPhase(name, 'running')
    let outcome: RunOutcome = 'failed'
    try {
      outcome = await work()
      return outcome
    } finally {
      const remaining = (this.runningJobs.get(name) ?? 1) - 1
      if (remaining > 0) this.runningJobs.set(name, remaining)
      else this.runningJobs.delete(name)
      this.emitJobPhase(name, outcome === 'completed' ? 'complete' : 'failed')
    }
  }

  private emitJobPhase(
    name: string,
    phase: 'running' | 'complete' | 'failed',
  ): void {
    if (!this.fastify.progress.hasActiveConnections()) return
    const event: ProgressEvent = {
      operationId: `scheduled-job-${name}`,
      type: 'scheduled-job',
      phase,
      progress: phase === 'running' ? 0 : 100,
      message: `Job ${name} ${phase}`,
      metadata: { job: name },
    }
    this.fastify.progress.emit(event)
  }
}

function specForType(
  type: DbSchedule['type'],
  config: IntervalConfig | CronConfig,
): ScheduleSpec | null {
  if ('expression' in config) {
    return type === 'cron' ? { type, config } : null
  }
  return type === 'interval' ? { type, config } : null
}

function isOverdue(spec: ScheduleSpec, lastRun: JobRunInfo | null): boolean {
  return (
    spec.type === 'interval' &&
    lastRun !== null &&
    Date.parse(lastRun.time) + intervalToMs(spec.config) <= Date.now()
  )
}

function sameSpec(a: ScheduleSpec, b: ScheduleSpec): boolean {
  return a.type === b.type && isDeepStrictEqual(a.config, b.config)
}
