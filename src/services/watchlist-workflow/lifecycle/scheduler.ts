import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export const RECONCILIATION_JOB_NAME = 'periodic-watchlist-reconciliation'

export interface SchedulerDeps {
  logger: FastifyBaseLogger
  fastify: FastifyInstance
}

// RSS and ETag cover additions; removal detection and label cleanup only happen on this periodic sync
export async function schedulePendingReconciliation(
  deps: SchedulerDeps,
): Promise<void> {
  try {
    const delayMinutes = 120 // 2 hours

    await deps.fastify.scheduler.updateJobSchedule(
      RECONCILIATION_JOB_NAME,
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

export async function unschedulePendingReconciliation(
  deps: SchedulerDeps,
): Promise<void> {
  try {
    // The scheduler checks job existence internally, so no guard is needed here
    await deps.fastify.scheduler.updateJobSchedule(
      RECONCILIATION_JOB_NAME,
      null,
      false,
    )

    deps.logger.debug('Unscheduled pending periodic reconciliation')
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error unscheduling pending reconciliation',
    )
    // Called during sync start, so a scheduler failure must not block the sync
  }
}

export async function cleanupExistingManualSync(
  deps: SchedulerDeps,
): Promise<void> {
  try {
    const existingSchedule = await deps.fastify.db.getScheduleByName(
      RECONCILIATION_JOB_NAME,
    )

    if (existingSchedule) {
      deps.logger.info(
        'Found existing periodic reconciliation job from previous run, cleaning up',
      )
      await deps.fastify.scheduler.unscheduleJob(RECONCILIATION_JOB_NAME)
      await deps.fastify.db.deleteSchedule(RECONCILIATION_JOB_NAME)
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

export async function setupPeriodicReconciliation(
  onTick: (jobName: string) => Promise<void>,
  deps: SchedulerDeps,
): Promise<void> {
  try {
    await deps.fastify.scheduler.scheduleJob(RECONCILIATION_JOB_NAME, onTick)

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
