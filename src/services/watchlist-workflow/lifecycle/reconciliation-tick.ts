import { reconcile } from '../orchestration/reconciler.js'
import type { WorkflowDeps } from '../types.js'
import {
  schedulePendingReconciliation,
  unschedulePendingReconciliation,
} from './scheduler.js'

export async function runPeriodicReconciliation(
  deps: WorkflowDeps,
): Promise<void> {
  try {
    if (deps.state.status !== 'running') {
      deps.logger.debug(
        'Skipping periodic reconciliation - workflow not running',
      )
      return
    }

    deps.logger.info('Periodic reconciliation triggered - performing full sync')

    // Unschedule first so a slow run cannot overlap the next tick
    await unschedulePendingReconciliation(deps)

    try {
      // RSS and ETag detection keep running during this sync; deduplication handles the overlap
      await reconcile({ mode: 'full' }, deps)

      deps.state.lastSuccessfulSyncTime = Date.now()

      deps.logger.info('Periodic reconciliation completed successfully')
    } finally {
      await schedulePendingReconciliation(deps)
    }
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error in periodic watchlist reconciliation',
    )

    try {
      await schedulePendingReconciliation(deps)
    } catch (scheduleError) {
      deps.logger.error(
        { error: scheduleError },
        'Failed to reschedule after reconciliation error',
      )
    }
  }
}
