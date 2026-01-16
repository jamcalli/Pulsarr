// Main exports for Plex watchlist service module
// This module consolidates all Plex watchlist functionality

// API layer
export {
  fetchPlexAvatar,
  getWatchlist,
  getWatchlistForUser,
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  PlexRateLimiter,
  pingPlex,
  type RateLimitError,
} from './api/index.js'

// Cache layer
export { RssFeedCacheManager } from './cache/index.js'

// Enrichment/processing
export {
  batchLookupByGuid,
  type EnrichedRssMetadata,
  type GuidLookupConfig,
  lookupByGuid,
  processWatchlistItems,
  selectPrimaryGuid,
  toItemsBatch,
  toItemsSingle,
} from './enrichment/index.js'

// ETag polling
export { EtagPoller } from './etag/etag-poller.js'

// Fetching layer
export {
  fetchRawRssFeed,
  fetchSelfWatchlist,
  fetchWatchlistFromRss,
  generateStableKey,
  getFriends,
  getOthersWatchlist,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from './fetching/index.js'
// Orchestration module
export {
  type ItemProcessorDeps,
  linkExistingItems,
  processAndSaveNewItems,
} from './orchestration/item-processor.js'
export {
  handleLinkedItemsForLabelSync,
  type RemovalHandlerDeps,
} from './orchestration/removal-handler.js'
export {
  type ProcessItemsInput,
  type ProcessItemsResult,
  processItemsForUser,
  type UnifiedProcessorDeps,
} from './orchestration/unified-processor.js'
export {
  extractKeysAndRelationships,
  getExistingItems,
  type WatchlistSyncDeps,
} from './orchestration/watchlist-sync.js'
// RSS module
export {
  detectRssCacheSettings,
  getCacheThresholdSeconds,
  mapRssItemsToWatchlist,
  type RssCacheInfo,
} from './rss/index.js'
// Sync module
export {
  categorizeItems,
  createWatchlistItem,
  type ItemCategorizerDeps,
  mapExistingItemsByKey,
  separateNewAndExistingItems,
} from './sync/item-categorizer.js'
// Users module
export {
  checkForRemovedFriends,
  clearUserCanSyncCache,
  createDefaultQuotasForUser,
  ensureFriendUsers,
  ensureTokenUsers,
  type FriendUsersDeps,
  getPermissionCacheSize,
  getUserCanSync,
  type PermissionsDeps,
  type TokenUsersDeps,
} from './users/index.js'
