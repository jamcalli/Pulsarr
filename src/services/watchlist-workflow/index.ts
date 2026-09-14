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
export { fetchWatchlists } from './fetching/index.js'
// Lifecycle
export {
  cleanupExistingManualSync,
  cleanupWorkflow,
  initializeWorkflow,
  RECONCILIATION_JOB_NAME,
  type SchedulerDeps,
  schedulePendingReconciliation,
  setupPeriodicReconciliation,
  unschedulePendingReconciliation,
  type WorkflowCleanupResult,
  type WorkflowComponents,
  type WorkflowInitResult,
  type WorkflowStartDeps,
  type WorkflowStopDeps,
} from './lifecycle/index.js'
// Orchestration
export {
  type FriendSyncResult,
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
  type NewFriendHandlerResult,
  processFriendChanges,
  reconcile,
  type SyncResult,
  syncSingleFriend,
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
// State
export { WorkflowState, type WorkflowStatus } from './state.js'
// Types
export type {
  ContentRoutingDeps,
  ContentRoutingParams,
  HealthCheckDeps,
  HealthCheckResult,
  WorkflowDeps,
} from './types.js'
