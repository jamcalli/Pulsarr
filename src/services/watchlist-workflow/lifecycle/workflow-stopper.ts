import type { WorkflowDeps } from '../types.js'

export function cleanupWorkflow(deps: Pick<WorkflowDeps, 'state'>): void {
  const { state } = deps

  state.endRun()

  if (state.rssCheckInterval) {
    clearTimeout(state.rssCheckInterval)
    state.rssCheckInterval = null
  }
  if (state.statusSyncDebounceTimer) {
    clearTimeout(state.statusSyncDebounceTimer)
    state.statusSyncDebounceTimer = null
  }

  state.clearReconciliationTimer()

  if (state.etagPoller) {
    state.etagPoller.stopStaggeredPolling()
    state.etagPoller.clearCache()
  }

  if (state.rssFeedCache) {
    state.rssFeedCache.clearCaches()
  }

  if (state.deferredRoutingQueue) {
    state.deferredRoutingQueue.stop()
  }

  state.rssFeedCache = null
  state.deferredRoutingQueue = null
}
