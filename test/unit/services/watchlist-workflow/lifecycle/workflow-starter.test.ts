import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

vi.mock('@services/watchlist-workflow/lifecycle/scheduler.js', () => ({
  cleanupExistingManualSync: vi.fn(async () => {}),
  setupPeriodicReconciliation: vi.fn(async () => {}),
}))

import { initializeWorkflow } from '@services/watchlist-workflow/lifecycle/workflow-starter.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'

describe('initializeWorkflow', () => {
  let deps: WorkflowDeps | undefined

  afterEach(() => {
    deps?.state.deferredRoutingQueue?.stop()
    deps = undefined
  })

  it('stops the previous deferred routing queue before replacing it', async () => {
    const stop = vi.fn()
    deps = createWorkflowDeps({
      plexService: {
        pingPlex: vi.fn(async () => true),
        generateAndSaveRssFeeds: vi.fn(async () => ({ self: '', friends: '' })),
      },
      state: { deferredRoutingQueue: { stop } },
    })
    const previousQueue = deps.state.deferredRoutingQueue

    await initializeWorkflow(deps)

    expect(stop).toHaveBeenCalledTimes(1)
    expect(deps.state.deferredRoutingQueue).not.toBe(previousQueue)
  })
})
