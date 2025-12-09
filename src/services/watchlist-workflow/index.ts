/**
 * Watchlist Workflow Module
 *
 * Exports for the modularized watchlist workflow service.
 * Consolidates all workflow functionality into focused modules.
 */

// Attribution
export {
  type AttributionPrefetchedData,
  updateAutoApprovalUserAttribution,
} from './attribution/index.js'
// Cache
export {
  lookupUserByUuid,
  refreshPlexUuidCache,
  updatePlexUuidCache,
} from './cache/index.js'
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
  hasUserField,
  queueForDeferredRouting,
  type RouteContentResult,
  type RouteMovieParams,
  type RouteShowParams,
  type RouteSingleItemParams,
  routeEnrichedItemsForUser,
  routeMovie,
  routeShow,
  routeSingleItem,
} from './routing/index.js'

// RSS processing
export {
  enrichRssItems,
  processRssFriendsItems,
  processRssSelfItems,
  type RssEnricherDeps,
} from './rss/index.js'
