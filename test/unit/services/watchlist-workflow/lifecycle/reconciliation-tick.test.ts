import type { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/orchestration/reconciler.js', () => ({
  reconcile: vi.fn(async () => {}),
}))

vi.mock('@services/watchlist-workflow/lifecycle/scheduler.js', () => ({
  schedulePendingReconciliation: vi.fn(async () => {}),
  unschedulePendingReconciliation: vi.fn(async () => {}),
}))

import { runPeriodicReconciliation } from '@services/watchlist-workflow/lifecycle/reconciliation-tick.js'
import {
  schedulePendingReconciliation,
  unschedulePendingReconciliation,
} from '@services/watchlist-workflow/lifecycle/scheduler.js'
import { reconcile } from '@services/watchlist-workflow/orchestration/reconciler.js'

describe('runPeriodicReconciliation', () => {
  let deps: WorkflowDeps
  let state: WorkflowState

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(reconcile).mockResolvedValue(undefined)
    vi.mocked(schedulePendingReconciliation).mockResolvedValue(undefined)
    vi.mocked(unschedulePendingReconciliation).mockResolvedValue(undefined)

    deps = createWorkflowDeps({ state: { lastSuccessfulSyncTime: 0 } })
    state = deps.state
  })

  it('skips the tick when the workflow is not running', async () => {
    state.status = 'stopped'

    await runPeriodicReconciliation(deps)

    expect(unschedulePendingReconciliation).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
    expect(schedulePendingReconciliation).not.toHaveBeenCalled()
    expect(state.lastSuccessfulSyncTime).toBe(0)
  })

  it('unschedules, reconciles, reschedules and bumps the sync time', async () => {
    state.status = 'running'

    await runPeriodicReconciliation(deps)

    expect(reconcile).toHaveBeenCalledWith({ mode: 'full' }, deps)
    expect(
      vi.mocked(unschedulePendingReconciliation).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(reconcile).mock.invocationCallOrder[0])
    expect(vi.mocked(reconcile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(schedulePendingReconciliation).mock.invocationCallOrder[0],
    )
    expect(schedulePendingReconciliation).toHaveBeenCalledTimes(1)
    expect(state.lastSuccessfulSyncTime).toBeGreaterThan(0)
  })

  it('reschedules and swallows the error when reconcile throws', async () => {
    state.status = 'running'
    vi.mocked(reconcile).mockRejectedValue(new Error('reconcile failed'))

    await expect(runPeriodicReconciliation(deps)).resolves.toBeUndefined()

    // once from the inner finally, once from the outer error path
    expect(schedulePendingReconciliation).toHaveBeenCalledTimes(2)
    expect(state.lastSuccessfulSyncTime).toBe(0)
  })

  it('does not throw when rescheduling itself fails', async () => {
    state.status = 'running'
    vi.mocked(schedulePendingReconciliation).mockRejectedValue(
      new Error('scheduler down'),
    )

    await expect(runPeriodicReconciliation(deps)).resolves.toBeUndefined()

    expect(schedulePendingReconciliation).toHaveBeenCalledTimes(2)
  })
})
