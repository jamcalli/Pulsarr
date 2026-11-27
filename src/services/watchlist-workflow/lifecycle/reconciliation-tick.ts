import { MS_PER_HOUR, MS_PER_MINUTE } from '@root/schemas/shared/time-units.js'
import { errorMessage } from '@utils/error-message.js'
import { reconcile } from '../orchestration/reconciler.js'
import type { WorkflowDeps } from '../types.js'

export const RECONCILIATION_DELAY_MS = 2 * MS_PER_HOUR

/** Replaces any pending tick with one RECONCILIATION_DELAY_MS from now, and does nothing once the run has ended. */
export function schedulePeriodicReconciliation(deps: WorkflowDeps): void {
  const { state } = deps
  const { signal } = state
  if (signal.aborted) return

  state.clearReconciliationTimer()
  state.reconciliationTimer = setTimeout(() => {
    state.reconciliationTimer = null
    if (signal.aborted) return
    void runPeriodicReconciliation(deps)
  }, RECONCILIATION_DELAY_MS)

  deps.logger.info(
    `Scheduled next periodic reconciliation in ${RECONCILIATION_DELAY_MS / MS_PER_MINUTE} minutes`,
  )
}

// RSS and ETag only catch additions, so removals and label cleanup wait for this full sync
export async function runPeriodicReconciliation(
  deps: WorkflowDeps,
): Promise<void> {
  if (deps.state.status !== 'running') {
    deps.logger.debug(
      'Skipping periodic reconciliation because the workflow is not running',
    )
    return
  }

  deps.logger.debug('Periodic reconciliation triggered, running a full sync')
  const { signal } = deps.state

  deps.state.clearReconciliationTimer()

  try {
    await reconcile({ mode: 'full' }, deps)
    deps.logger.debug('Periodic reconciliation completed successfully')
  } catch (error) {
    deps.logger.error(
      { error, errorMessage: errorMessage(error) },
      'Error in periodic watchlist reconciliation',
    )
  } finally {
    if (!signal.aborted) schedulePeriodicReconciliation(deps)
  }
}
