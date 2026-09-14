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
  const { signal } = deps.state

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
    // stop() or a restart during the run owns the schedule now; do not recreate it
    if (!signal.aborted) {
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
