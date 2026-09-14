import type { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import type { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WorkflowDeps } from '@services/watchlist-workflow/types.js'
import { createMockLogger } from './logger.js'

type ShallowPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export interface WorkflowDepsOverrides
  extends ShallowPartial<Omit<WorkflowDeps, 'state' | 'logger'>> {
  state?: {
    etagPoller?: Partial<EtagPoller> | null
    deferredRoutingQueue?: Partial<DeferredRoutingQueue> | null
  } & Partial<Omit<WorkflowState, 'etagPoller' | 'deferredRoutingQueue'>>
}

export function createWorkflowDeps(
  overrides: WorkflowDepsOverrides = {},
): WorkflowDeps {
  const state = new WorkflowState()
  Object.assign(state, overrides.state)

  // the only place tests widen partial fakes into the real dependency types
  return {
    logger: createMockLogger(),
    config: {},
    db: {},
    fastify: { plexServerService: overrides.plexServerService ?? {} },
    plexService: {},
    contentRouter: {},
    sonarrManager: {},
    radarrManager: {},
    plexServerService: {},
    notifications: {},
    statusService: {},
    plexLabelSyncService: {},
    itemProcessorDeps: {},
    ...overrides,
    state,
  } as unknown as WorkflowDeps
}
