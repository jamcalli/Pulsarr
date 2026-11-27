import type { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../../helpers/deferred.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/orchestration/reconciler.js', () => ({
  reconcile: vi.fn(async () => {}),
}))

import {
  RECONCILIATION_DELAY_MS,
  runPeriodicReconciliation,
  schedulePeriodicReconciliation,
} from '@services/watchlist-workflow/lifecycle/reconciliation-tick.js'
import { cleanupWorkflow } from '@services/watchlist-workflow/lifecycle/workflow-stopper.js'
import { reconcile } from '@services/watchlist-workflow/orchestration/reconciler.js'

describe('periodic reconciliation', () => {
  let deps: WorkflowDeps
  let state: WorkflowState

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(reconcile).mockResolvedValue(undefined)

    deps = createWorkflowDeps({ state: { lastSuccessfulSyncTime: 0 } })
    state = deps.state
  })

  afterEach(() => {
    state.endRun()
    state.clearReconciliationTimer()
    vi.useRealTimers()
  })

  describe('schedulePeriodicReconciliation', () => {
    it('leaves one pending timer when scheduled twice', () => {
      schedulePeriodicReconciliation(deps)
      const first = state.reconciliationTimer
      schedulePeriodicReconciliation(deps)

      expect(state.reconciliationTimer).not.toBeNull()
      expect(state.reconciliationTimer).not.toBe(first)
      expect(vi.getTimerCount()).toBe(1)
    })

    it('runs a full reconcile once the delay passes', async () => {
      state.status = 'running'
      schedulePeriodicReconciliation(deps)

      await vi.advanceTimersByTimeAsync(RECONCILIATION_DELAY_MS - 1)
      expect(reconcile).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(reconcile).toHaveBeenCalledWith({ mode: 'full' }, deps)
      expect(state.reconciliationTimer).not.toBeNull()
      expect(vi.getTimerCount()).toBe(1)
    })

    it('schedules nothing when the run has ended', () => {
      deps = createWorkflowDeps({ aborted: true })
      state = deps.state

      schedulePeriodicReconciliation(deps)

      expect(state.reconciliationTimer).toBeNull()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('does not fire after the workflow stops', async () => {
      state.status = 'running'
      schedulePeriodicReconciliation(deps)

      cleanupWorkflow(deps)
      await vi.advanceTimersByTimeAsync(RECONCILIATION_DELAY_MS * 2)

      expect(state.reconciliationTimer).toBeNull()
      expect(reconcile).not.toHaveBeenCalled()
    })

    it('does not reconcile when the signal aborts before the timer fires', async () => {
      state.status = 'running'
      schedulePeriodicReconciliation(deps)

      state.endRun()
      await vi.advanceTimersByTimeAsync(RECONCILIATION_DELAY_MS)

      expect(reconcile).not.toHaveBeenCalled()
      expect(state.reconciliationTimer).toBeNull()
    })
  })

  describe('runPeriodicReconciliation', () => {
    it('skips the tick and keeps the pending timer when the workflow is not running', async () => {
      state.status = 'stopped'
      schedulePeriodicReconciliation(deps)
      const pending = state.reconciliationTimer

      await runPeriodicReconciliation(deps)

      expect(reconcile).not.toHaveBeenCalled()
      expect(state.reconciliationTimer).toBe(pending)
      expect(state.lastSuccessfulSyncTime).toBe(0)
    })

    it('clears the pending timer before reconciling, then schedules one next tick', async () => {
      state.status = 'running'
      schedulePeriodicReconciliation(deps)
      let timerDuringRun: NodeJS.Timeout | null | undefined
      vi.mocked(reconcile).mockImplementation(async () => {
        timerDuringRun = state.reconciliationTimer
      })

      await runPeriodicReconciliation(deps)

      expect(timerDuringRun).toBeNull()
      expect(reconcile).toHaveBeenCalledWith({ mode: 'full' }, deps)
      expect(state.reconciliationTimer).not.toBeNull()
      expect(vi.getTimerCount()).toBe(1)
    })

    it('schedules the next tick and swallows the error when reconcile throws', async () => {
      state.status = 'running'
      vi.mocked(reconcile).mockRejectedValue(new Error('reconcile failed'))

      await expect(runPeriodicReconciliation(deps)).resolves.toBeUndefined()

      expect(state.reconciliationTimer).not.toBeNull()
      expect(vi.getTimerCount()).toBe(1)
    })

    it('does not reschedule when the workflow stopped during the run', async () => {
      state.status = 'running'
      vi.mocked(reconcile).mockImplementation(async () => {
        state.status = 'stopping'
        state.endRun()
      })

      await runPeriodicReconciliation(deps)

      expect(reconcile).toHaveBeenCalledTimes(1)
      expect(state.reconciliationTimer).toBeNull()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('leaves the timer of a run that replaced it untouched', async () => {
      state.status = 'running'
      const syncing = createDeferred<void>()
      vi.mocked(reconcile).mockReturnValue(syncing.promise)

      const tick = runPeriodicReconciliation(deps)
      state.endRun()
      state.beginRun()
      state.status = 'running'
      schedulePeriodicReconciliation(deps)
      const replacementTimer = state.reconciliationTimer
      syncing.resolve()
      await tick

      expect(replacementTimer).not.toBeNull()
      expect(state.reconciliationTimer).toBe(replacementTimer)
      expect(vi.getTimerCount()).toBe(1)
    })
  })
})
