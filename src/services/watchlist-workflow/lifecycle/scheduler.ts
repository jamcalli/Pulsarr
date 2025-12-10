/**
 * Scheduler Module
 *
 * Handles periodic reconciliation scheduling operations.
 */

import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Dependencies for scheduler operations
 */
export interface SchedulerDeps {
  logger: FastifyBaseLogger
  fastify: FastifyInstance
  jobName: string
}

/**
 * Schedule the next periodic reconciliation.
 *
 * With RSS/ETag handling real-time additions, this periodic sync primarily handles:
 * - Removal detection (comparing DB vs fetched watchlist)
 * - Label cleanup for items no longer on watchlists
 * - Catch-all failsafe for edge cases missed by incremental detection
 *
 * @param deps - Service dependencies
 */
export async function schedulePendingReconciliation(
  deps: SchedulerDeps,
): Promise<void> {
  try {
    const delayMinutes = 120 // 2 hours

    await deps.fastify.scheduler.updateJobSchedule(
      deps.jobName,
      {
        minutes: delayMinutes,
        runImmediately: false,
      },
      true,
    )

    deps.logger.info(
      `Scheduled next periodic reconciliation in ${delayMinutes} minutes`,
    )
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error scheduling pending reconciliation',
    )
    throw error
  }
}

/**
 * Cancel any pending periodic reconciliation job.
 *
 * @param deps - Service dependencies
 */
export async function unschedulePendingReconciliation(
  deps: SchedulerDeps,
): Promise<void> {
  try {
    // Simply disable the job - scheduler handles existence check internally
    await deps.fastify.scheduler.updateJobSchedule(deps.jobName, null, false)

    deps.logger.debug('Unscheduled pending periodic reconciliation')
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error unscheduling pending reconciliation',
    )
    // Don't throw here - this is called during sync start and shouldn't block sync
  }
}

/**
 * Clean up any existing manual sync job from previous runs.
 *
 * @param deps - Service dependencies
 */
export async function cleanupExistingManualSync(
  deps: SchedulerDeps,
): Promise<void> {
  try {
    const existingSchedule = await deps.fastify.db.getScheduleByName(
      deps.jobName,
    )

    if (existingSchedule) {
      deps.logger.info(
        'Found existing periodic reconciliation job from previous run, cleaning up',
      )
      await deps.fastify.scheduler.unscheduleJob(deps.jobName)
      await deps.fastify.db.deleteSchedule(deps.jobName)
      deps.logger.info(
        'Successfully cleaned up existing periodic reconciliation job',
      )
    }
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error cleaning up existing periodic reconciliation job',
    )
    throw error
  }
}

/**
 * Setup periodic reconciliation job.
 *
 * Creates the scheduled job with the provided tick handler.
 * The tick handler is responsible for:
 * - Checking if workflow is running
 * - Unscheduling to prevent concurrent execution
 * - Pausing change detection
 * - Running reconciliation
 * - Resuming change detection
 * - Rescheduling the next run
 *
 * @param onTick - Callback to execute on each scheduled tick
 * @param deps - Service dependencies
 */
export async function setupPeriodicReconciliation(
  onTick: (jobName: string) => Promise<void>,
  deps: SchedulerDeps,
): Promise<void> {
  try {
    // Create the periodic job with the provided tick handler
    await deps.fastify.scheduler.scheduleJob(deps.jobName, onTick)

    deps.logger.info(
      'Periodic watchlist reconciliation job created (will be dynamically scheduled)',
    )
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error setting up periodic reconciliation',
    )
    throw error
  }
}
