import { WorkflowState } from '@services/watchlist-workflow/state.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowDeps } from '../../../mocks/watchlist-workflow-deps.js'

const DEBOUNCE_MS = 60 * 1000

function createStatusDeps(aborted: boolean) {
  const syncAllStatuses = vi.fn(async () => ({ shows: 1, movies: 2 }))
  const deps = createWorkflowDeps({
    aborted,
    statusService: { syncAllStatuses },
  })

  return { deps, state: deps.state, syncAllStatuses }
}

describe('WorkflowState run signal', () => {
  it('is aborted until a run begins', () => {
    const state = new WorkflowState()

    expect(state.signal.aborted).toBe(true)

    state.beginRun()

    expect(state.signal.aborted).toBe(false)
  })

  it('is aborted again once the run ends', () => {
    const state = new WorkflowState()
    state.beginRun()
    const signal = state.signal

    state.endRun()

    expect(signal.aborted).toBe(true)
    expect(state.signal.aborted).toBe(true)
  })

  it('aborts the previous signal when a second run begins', () => {
    const state = new WorkflowState()
    state.beginRun()
    const first = state.signal

    state.beginRun()

    expect(first.aborted).toBe(true)
    expect(state.signal.aborted).toBe(false)
    expect(state.signal).not.toBe(first)
  })
})

describe('scheduleDebouncedStatusSync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not arm a timer when the run has ended', () => {
    const { deps, state } = createStatusDeps(true)

    state.scheduleDebouncedStatusSync(deps)

    expect(state.statusSyncDebounceTimer).toBeNull()
  })

  it('syncs when the run is still live at fire time', async () => {
    vi.useFakeTimers()
    const { deps, state, syncAllStatuses } = createStatusDeps(false)

    state.scheduleDebouncedStatusSync(deps)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(syncAllStatuses).toHaveBeenCalledTimes(1)
  })

  it('does not sync when the run ends between arming and firing', async () => {
    vi.useFakeTimers()
    const { deps, state, syncAllStatuses } = createStatusDeps(false)

    state.scheduleDebouncedStatusSync(deps)
    state.endRun()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(syncAllStatuses).not.toHaveBeenCalled()
  })
})
