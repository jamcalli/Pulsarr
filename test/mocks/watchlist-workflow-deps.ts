import type { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import type { RssFeedCacheManager } from '@services/plex-watchlist/cache/rss-feed-cache.js'
import type { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { createMockLogger } from './logger.js'

type ShallowPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export interface WorkflowDepsOverrides
  extends ShallowPartial<Omit<WorkflowDeps, 'state' | 'logger'>> {
  aborted?: boolean
  state?: {
    etagPoller?: Partial<EtagPoller> | null
    deferredRoutingQueue?: Partial<DeferredRoutingQueue> | null
    rssFeedCache?: Partial<RssFeedCacheManager> | null
  } & Partial<
    Omit<WorkflowState, 'etagPoller' | 'deferredRoutingQueue' | 'rssFeedCache'>
  >
}

export function createWorkflowDeps(
  overrides: WorkflowDepsOverrides = {},
): WorkflowDeps {
  const { aborted, ...depsOverrides } = overrides

  const state = new WorkflowState()
  Object.assign(state, depsOverrides.state)
  state.beginRun()
  if (aborted) {
    state.endRun()
  }

  // the only place tests widen partial fakes into the real dependency types
  return {
    logger: createMockLogger(),
    config: {},
    db: {},
    fastify: { plexServerService: depsOverrides.plexServerService ?? {} },
    plexService: {},
    contentRouter: {},
    sonarrManager: {},
    radarrManager: {},
    plexServerService: {},
    notifications: {},
    statusService: {},
    plexLabelSyncService: {},
    itemProcessorDeps: {},
    ...depsOverrides,
    state,
  } as unknown as WorkflowDeps
}
