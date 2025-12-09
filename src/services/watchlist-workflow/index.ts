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
// ETag polling
export {
  buildEtagUserInfoFromMap,
  getEtagFriendsList,
  handleStaggeredPollResult,
  refreshFriendsForStaggeredPolling,
} from './etag/index.js'
// Fetching
export {
  fetchWatchlists,
  type WatchlistFetcherDeps,
} from './fetching/index.js'
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

// Lifecycle
// export { } from './lifecycle/index.js'

// Orchestration
export {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
  type NewFriendHandlerResult,
  processFriendChanges,
  type SyncResult,
  syncWatchlistItems,
} from './orchestration/index.js'

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
  routeNewItemsForUser,
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
