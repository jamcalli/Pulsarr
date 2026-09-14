import type { WorkflowDeps } from '../types.js'
import { cleanupExistingManualSync } from './scheduler.js'

export async function cleanupWorkflow(
  deps: Pick<WorkflowDeps, 'logger' | 'fastify' | 'state'>,
): Promise<void> {
  const { state } = deps

  if (state.rssCheckInterval) {
    clearInterval(state.rssCheckInterval)
    state.rssCheckInterval = null
  }
  if (state.statusSyncDebounceTimer) {
    clearTimeout(state.statusSyncDebounceTimer)
    state.statusSyncDebounceTimer = null
  }

  try {
    await cleanupExistingManualSync(deps)
  } catch (error) {
    deps.logger.error(
      { error },
      'Error cleaning up periodic reconciliation during shutdown',
    )
  }

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
