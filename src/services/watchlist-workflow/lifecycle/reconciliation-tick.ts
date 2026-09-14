import { reconcile } from '../orchestration/reconciler.js'
import type { WorkflowDeps } from '../types.js'
import {
  schedulePendingReconciliation,
  unschedulePendingReconciliation,
} from './scheduler.js'

export async function runPeriodicReconciliation(
  deps: WorkflowDeps,
): Promise<void> {
  if (deps.state.status !== 'running') {
    deps.logger.debug('Skipping periodic reconciliation - workflow not running')
    return
  }

  deps.logger.info('Periodic reconciliation triggered - performing full sync')

  // Unschedule first so a slow run cannot overlap the next tick
  await unschedulePendingReconciliation(deps)

  try {
    // RSS and ETag detection keep running during this sync; deduplication handles the overlap
    await reconcile({ mode: 'full' }, deps)
    deps.logger.info('Periodic reconciliation completed successfully')
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error in periodic watchlist reconciliation',
    )
  } finally {
    // stop() during the run has already removed the schedule; do not recreate it
    if (deps.state.status === 'running') {
      try {
        await schedulePendingReconciliation(deps)
      } catch (scheduleError) {
        deps.logger.error(
          { error: scheduleError },
          'Failed to reschedule periodic reconciliation',
        )
      }
    }
  }
}
