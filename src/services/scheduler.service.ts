/**
 * Scheduler Service
 *
 * Provides a centralized job scheduling system for the application using toad-scheduler.
 * This service manages interval and cron-based jobs, persists schedules to the database,
 * and provides an interface for managing job schedules.
 *
 * Responsible for:
 * - Managing scheduled job registration and execution
 * - Persisting job schedules in the database
 * - Handling job failures and logging
 * - Tracking job execution history
 * - Supporting both interval-based and cron-based schedules
 * - Providing manual job execution
 *
 * @example
 * // In another service:
 * const schedulerService = new SchedulerService(log, fastify);
 * await schedulerService.scheduleJob('my-job', async () => {
 *   // Job implementation
 * });
 */

import type {
  CronConfig,
  DbSchedule,
  IntervalConfig,
} from '@root/types/scheduler.types.js'
import { createServiceLogger } from '@utils/logger.js'
import { CronExpressionParser } from 'cron-parser'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  AsyncTask,
  CronJob,
  SimpleIntervalJob,
  ToadScheduler,
} from 'toad-scheduler'

/** Handler function type for scheduled jobs */
export type JobHandler = (jobName: string) => Promise<void>

/** Map to track registered jobs and their handlers */
type JobMap = Map<
  string,
  {
    job: SimpleIntervalJob | CronJob | null
    handler: JobHandler
  }
>

export class SchedulerService {
  /** The scheduler instance */
  private readonly scheduler: ToadScheduler

  /** Map of job names to their job instances and handlers */
  private readonly jobs: JobMap = new Map()
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'SCHEDULER')
  }

  /** Track if we're in the initial startup phase */
  private isInitializing = true

  /** Expected handler count for completion tracking */
  private expectedHandlerCount = 0

  /** Flag to track if ready message has been logged */
  private hasLoggedReady = false

  /**
   * Creates a new SchedulerService instance
   *
   * @param baseLog - Fastify logger for recording operations
   * @param fastify - Fastify instance for accessing other services
   */
  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.scheduler = new ToadScheduler()
    this.log.info('Scheduler service initialized')
  }

  /**
   * Initialize jobs from database records
   *
   * Loads all job schedules from the database and starts enabled jobs
   * that have registered handlers.
   */
  async initializeJobsFromDatabase(): Promise<void> {
    try {
      const schedules = await this.fastify.db.getAllSchedules()
      this.log.debug(`Initializing ${schedules.length} jobs from database`)

      let _jobsScheduled = 0
      let _jobsDisabled = 0

      for (const schedule of schedules) {
        const handler = this.jobs.get(schedule.name)?.handler

        if (handler && schedule.enabled) {
          this.log.debug(`Setting up job: ${schedule.name}`)

          try {
            const job = this.createJob(
              schedule.name,
              schedule.type,
              schedule.config,
              handler,
            )

            // Remove any existing job with this name
            if (this.jobs.has(schedule.name)) {
              this.scheduler.removeById(schedule.name)
            }

            // Add the new job
            if (schedule.type === 'interval') {
              this.scheduler.addSimpleIntervalJob(job as SimpleIntervalJob)
            } else if (schedule.type === 'cron') {
              this.scheduler.addCronJob(job as CronJob)
            }

            // Save reference to the job
            this.jobs.set(schedule.name, {
              job,
              handler,
            })

            this.log.debug(`Job ${schedule.name} scheduled successfully`)
            _jobsScheduled++
          } catch (error) {
            this.log.error({ error }, `Error setting up job ${schedule.name}`)
          }
        } else if (!handler) {
          // During initial startup, this is expected as services haven't registered handlers yet
          if (this.isInitializing) {
            this.log.debug(
              `Job ${schedule.name} found in database - awaiting handler registration from service`,
            )
          } else {
            // After initialization, this would be a real issue
            this.log.warn(`No handler registered for job ${schedule.name}`)
          }
        } else if (!schedule.enabled) {
          this.log.debug(`Job ${schedule.name} is disabled`)
          _jobsDisabled++
        }
      }

      // Store expected handler count for completion tracking
      this.expectedHandlerCount = schedules.filter((s) => s.enabled).length

      // Log initialization summary
      this.log.debug(
        {
          scheduled: _jobsScheduled,
          disabled: _jobsDisabled,
          total: schedules.length,
        },
        'Job initialization summary',
      )

      // Start monitoring for completion
      this.checkForCompletionReadiness()

      // Mark initialization as complete after a short delay to allow services to register
      setTimeout(() => {
        this.isInitializing = false
        this.log.debug('Scheduler initialization phase complete')
        // Final check for completion after initialization period
        this.checkForCompletionReadiness()
      }, 5000)
    } catch (error) {
      this.log.error({ error }, 'Error initializing jobs from database')
    }
  }

  /**
   * Creates a job instance based on configuration
   *
   * @param name - Unique name for the job
   * @param type - Type of job ('interval' or 'cron')
   * @param config - Configuration specific to the job type
   * @param handler - Function to execute when the job runs
   * @returns The created job instance
   */
  private createJob(
    name: string,
    type: 'interval' | 'cron',
    config: IntervalConfig | CronConfig,
    handler: JobHandler,
  ): SimpleIntervalJob | CronJob {
    // Create an async task that wraps the handler and adds error handling
    const task = new AsyncTask(
      `${name}-task`,
      async () => {
        try {
          // Only log the start of the job at debug level for cleaner logs
          this.log.debug(`Running scheduled job: ${name}`)
          await handler(name)

          // Update last run time
          await this.fastify.db.updateSchedule(name, {
            last_run: {
              time: new Date().toISOString(),
              status: 'completed',
            },
          })

          // Calculate and update next run time
          if (type === 'interval') {
            const intervalConfig = config as IntervalConfig
            const nextRun = new Date()
            if (intervalConfig.days)
              nextRun.setDate(nextRun.getDate() + intervalConfig.days)
            if (intervalConfig.hours)
              nextRun.setHours(nextRun.getHours() + intervalConfig.hours)
            if (intervalConfig.minutes)
              nextRun.setMinutes(nextRun.getMinutes() + intervalConfig.minutes)
            if (intervalConfig.seconds)
              nextRun.setSeconds(nextRun.getSeconds() + intervalConfig.seconds)

            await this.fastify.db.updateSchedule(name, {
              next_run: {
                time: nextRun.toISOString(),
                status: 'pending',
                estimated: true,
              },
            })
          } else if (type === 'cron') {
            // For cron jobs, use the calculateNextCronRun method
            const cronConfig = config as CronConfig
            const nextRun = this.calculateNextCronRun(cronConfig.expression)

            await this.fastify.db.updateSchedule(name, {
              next_run: {
                time: nextRun.toISOString(),
                status: 'pending',
                estimated: true,
              },
            })
          }

          this.log.debug(`Job ${name} completed successfully`)
        } catch (error) {
          this.log.error({ error }, `Error in job ${name}`)

          // Update with error status
          await this.fastify.db.updateSchedule(name, {
            last_run: {
              time: new Date().toISOString(),
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            },
          })
        }
      },
      (error) => {
        this.log.error({ error }, `Job task error for ${name}`)
      },
    )

    // Create the appropriate job type based on configuration
    if (type === 'interval') {
      const intervalConfig = config as IntervalConfig
      return new SimpleIntervalJob(
        {
          ...intervalConfig,
          runImmediately: intervalConfig.runImmediately ?? false,
        },
        task,
        {
          id: name,
          preventOverrun: true,
        },
      )
    }

    if (type === 'cron') {
      const cronConfig = config as CronConfig
      return new CronJob(
        {
          cronExpression: cronConfig.expression,
        },
        task,
        {
          id: name,
          preventOverrun: true,
        },
      )
    }

    throw new Error(`Unknown job type: ${type}`)
  }

  /**
   * Register a job handler and optionally schedule it
   *
   * @param name - Unique name for the job
   * @param handler - Function to execute when the job runs
   * @returns Promise resolving to true if successful
   */
  async scheduleJob(name: string, handler: JobHandler): Promise<boolean> {
    try {
      // Save handler reference
      const existingJob = this.jobs.get(name)

      if (existingJob) {
        // Update handler but keep existing job
        this.jobs.set(name, {
          job: existingJob.job,
          handler,
        })
        this.log.debug(`Updated handler for existing job: ${name}`)
      } else {
        // Register new handler
        this.jobs.set(name, {
          job: null,
          handler,
        })
        // Log at appropriate level based on initialization state
        if (this.isInitializing) {
          this.log.debug(
            `Registered handler for job: ${name} (during initialization)`,
          )
        } else {
          this.log.info(`Registered handler for new job: ${name}`)
        }
      }

      // Get schedule from database
      let schedule = await this.fastify.db.getScheduleByName(name)

      // If no schedule exists, create default
      if (!schedule) {
        // Use default interval of 24 hours if not specified
        const defaultConfig = { hours: 24 }

        // Calculate next run time for default config
        const nextRun = new Date()
        nextRun.setHours(nextRun.getHours() + 24)

        await this.fastify.db.createSchedule({
          name,
          type: 'interval',
          config: defaultConfig,
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        schedule = await this.fastify.db.getScheduleByName(name)
        this.log.debug(
          `Created default schedule for job ${name} with next run at ${nextRun.toISOString()}`,
        )
      }

      // If enabled, create and add the job
      if (schedule?.enabled) {
        const job = this.createJob(
          name,
          schedule.type,
          schedule.config,
          handler,
        )

        // Remove any existing job with this name
        if (existingJob) {
          this.scheduler.removeById(name)
        }

        // Add the new job
        if (schedule.type === 'interval') {
          this.scheduler.addSimpleIntervalJob(job as SimpleIntervalJob)
        } else if (schedule.type === 'cron') {
          this.scheduler.addCronJob(job as CronJob)
        }

        // Save reference to the job
        this.jobs.set(name, { job, handler })

        this.log.debug(`Job ${name} scheduled successfully`)
      }

      // Check if we're now ready (all handlers registered)
      this.checkForCompletionReadiness()

      return true
    } catch (error) {
      this.log.error({ error }, `Error scheduling job ${name}`)
      return false
    }
  }

  /**
   * Remove a job from the scheduler
   *
   * @param name - Name of the job to remove
   * @returns Promise resolving to true if successful
   */
  async unscheduleJob(name: string): Promise<boolean> {
    try {
      const job = this.jobs.get(name)
      if (job) {
        this.scheduler.removeById(name)
        this.jobs.delete(name)
        this.log.debug(`Job ${name} unscheduled successfully`)
        return true
      }
      return false
    } catch (error) {
      this.log.error({ error }, `Error unscheduling job ${name}`)
      return false
    }
  }

  /**
   * Run a job immediately, outside of its schedule
   *
   * @param name - Name of the job to run
   * @returns Promise resolving to true if successful
   */
  async runJobNow(name: string): Promise<boolean> {
    try {
      const jobData = this.jobs.get(name)
      if (!jobData) {
        return false
      }

      this.log.info(`Manually running job: ${name}`)

      // Run the handler
      await jobData.handler(name)

      // Update last run time
      await this.fastify.db.updateSchedule(name, {
        last_run: {
          time: new Date().toISOString(),
          status: 'completed',
        },
      })

      this.log.info(`Job ${name} executed manually`)
      return true
    } catch (error) {
      this.log.error({ error }, `Error executing job ${name}`)

      // Update with error status
      await this.fastify.db.updateSchedule(name, {
        last_run: {
          time: new Date().toISOString(),
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      })

      return false
    }
  }

  /**
   * Update a job's schedule configuration
   *
   * @param name - Name of the job to update
   * @param config - New configuration for the job
   * @param enabled - Optional flag to enable or disable the job
   * @returns Promise resolving to true if successful
   */
  async updateJobSchedule(
    name: string,
    config: IntervalConfig | CronConfig | null,
    enabled?: boolean,
  ): Promise<boolean> {
    try {
      // Get current schedule
      const schedule = await this.fastify.db.getScheduleByName(name)
      if (!schedule) {
        this.log.warn(`Cannot update non-existent schedule: ${name}`)
        return false
      }

      // Update in database
      const updates: Partial<
        Omit<DbSchedule, 'id' | 'name' | 'created_at' | 'updated_at'>
      > = {}

      // Get the configuration to use for calculating next run time
      const configToUse = config || schedule.config
      const typeToUse = schedule.type

      if (config) {
        updates.config = config
      }

      if (enabled !== undefined) {
        updates.enabled = enabled
      }

      // Calculate next run time based on the schedule type and config
      let nextRun: Date | null = null
      if (typeToUse === 'interval') {
        const intervalConfig = configToUse as IntervalConfig
        nextRun = new Date()
        if (intervalConfig.days)
          nextRun.setDate(nextRun.getDate() + intervalConfig.days)
        if (intervalConfig.hours)
          nextRun.setHours(nextRun.getHours() + intervalConfig.hours)
        if (intervalConfig.minutes)
          nextRun.setMinutes(nextRun.getMinutes() + intervalConfig.minutes)
        if (intervalConfig.seconds)
          nextRun.setSeconds(nextRun.getSeconds() + intervalConfig.seconds)
      } else if (typeToUse === 'cron') {
        const cronConfig = configToUse as CronConfig
        nextRun = this.calculateNextCronRun(cronConfig.expression)
      }

      // Add next run time to updates if it was calculated
      if (nextRun) {
        updates.next_run = {
          time: nextRun.toISOString(),
          status: 'pending',
          estimated: true,
        }
      }

      await this.fastify.db.updateSchedule(name, updates)

      // Get job and handler
      const jobData = this.jobs.get(name)
      if (!jobData) {
        this.log.warn(`Job ${name} has no registered handler`)
        return true // DB was updated, but no active job
      }

      // If job was enabled and should remain enabled, recreate with new config
      if (schedule.enabled && (enabled === undefined || enabled === true)) {
        const updatedSchedule = await this.fastify.db.getScheduleByName(name)
        if (!updatedSchedule) return false

        // Remove old job
        this.scheduler.removeById(name)

        // Create new job with updated config
        const job = this.createJob(
          name,
          updatedSchedule.type,
          updatedSchedule.config,
          jobData.handler,
        )

        // Add the new job
        if (updatedSchedule.type === 'interval') {
          this.scheduler.addSimpleIntervalJob(job as SimpleIntervalJob)
        } else if (updatedSchedule.type === 'cron') {
          this.scheduler.addCronJob(job as CronJob)
        }

        // Update reference
        this.jobs.set(name, { job, handler: jobData.handler })

        this.log.debug(`Job ${name} updated with new configuration`)
      }
      // If job was disabled but should be enabled
      else if (!schedule.enabled && enabled === true) {
        const updatedSchedule = await this.fastify.db.getScheduleByName(name)
        if (!updatedSchedule) return false

        // Create new job
        const job = this.createJob(
          name,
          updatedSchedule.type,
          updatedSchedule.config,
          jobData.handler,
        )

        // Add the job
        if (updatedSchedule.type === 'interval') {
          this.scheduler.addSimpleIntervalJob(job as SimpleIntervalJob)
        } else if (updatedSchedule.type === 'cron') {
          this.scheduler.addCronJob(job as CronJob)
        }

        // Update reference
        this.jobs.set(name, { job, handler: jobData.handler })

        this.log.debug(`Job ${name} enabled and scheduled`)
      }
      // If job was enabled but should be disabled
      else if (schedule.enabled && enabled === false) {
        // Remove the job but keep the handler
        this.scheduler.removeById(name)
        this.jobs.set(name, { job: null, handler: jobData.handler })

        this.log.debug(`Job ${name} disabled`)
      }

      return true
    } catch (error) {
      this.log.error({ error }, `Error updating job schedule ${name}`)
      return false
    }
  }

  /**
   * Get a list of all registered job names
   *
   * @returns Array of job names
   */
  getActiveJobs(): string[] {
    return Array.from(this.jobs.keys())
  }

  /**
   * Stop the scheduler and all running jobs
   *
   * Should be called during application shutdown.
   */
  stop(): void {
    this.log.info('Stopping all scheduled jobs')
    this.scheduler.stop()
  }

  /**
   * Calculate the next run time for a cron expression
   */
  private calculateNextCronRun(expression: string): Date {
    try {
      const interval = CronExpressionParser.parse(expression, {
        currentDate: new Date(),
      })
      return interval.next().toDate()
    } catch (err) {
      this.log.warn(
        { err, expression },
        'Invalid cron expression; defaulting to +24h',
      )
      const next = new Date()
      next.setHours(next.getHours() + 24)
      return next
    }
  }

  /**
   * Check if all expected handlers are registered and log completion message
   */
  private checkForCompletionReadiness(): void {
    // Don't check if we've already logged ready or have no expected handlers
    if (this.hasLoggedReady || this.expectedHandlerCount === 0) {
      return
    }

    // Count currently active (scheduled) jobs
    let activeJobCount = 0
    for (const [_name, jobData] of this.jobs) {
      if (jobData.job !== null) {
        activeJobCount++
      }
    }

    // Count total registered handlers
    const registeredHandlerCount = this.jobs.size

    // Check if we have handlers for all expected jobs
    if (registeredHandlerCount >= this.expectedHandlerCount) {
      this.hasLoggedReady = true
      this.log.info(
        `Scheduler ready: ${activeJobCount} jobs scheduled and active`,
      )
    }
  }
}
