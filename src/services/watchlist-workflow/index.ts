/**
 * Watchlist Workflow Module
 *
 * Exports for the modularized watchlist workflow service.
 * Consolidates all workflow functionality into focused modules.
 */

// Types
export type {
  AttributionDeps,
  BaseDeps,
  ContentRoutingDeps,
  ContentRoutingParams,
  FriendHandlerDeps,
  HealthCheckDeps,
  HealthCheckResult,
  LifecycleDeps,
  ReconcilerDeps,
  RssFriendsProcessorDeps,
  RssProcessorDeps,
  StaggeredPollerDeps,
  SyncEngineDeps,
  UuidCacheDeps,
} from './types.js'

// Attribution
// export { } from './attribution/index.js'

// Cache
// export { } from './cache/index.js'

// ETag polling
// export { } from './etag/index.js'

// Fetching
// export { } from './fetching/index.js'

// Lifecycle
// export { } from './lifecycle/index.js'

// Orchestration
// export { } from './orchestration/index.js'

// Routing
export {
  checkHealthAndQueueIfUnavailable,
  checkInstanceHealth,
  queueForDeferredRouting,
} from './routing/index.js'

// RSS processing
// export { } from './rss/index.js'
