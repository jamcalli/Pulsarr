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

// Enrichment/processing
export {
  processWatchlistItems,
  toItemsBatch,
  toItemsSingle,
} from './enrichment/index.js'

// ETag polling
export { EtagPoller } from './etag/etag-poller.js'

// Fetching layer
export {
  fetchSelfWatchlist,
  fetchWatchlistFromRss,
  getFriends,
  getOthersWatchlist,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from './fetching/index.js'
// Notifications module
export {
  type NotificationDeps,
  sendWatchlistNotifications,
  type WatchlistItemNotification,
} from './notifications/notification-sender.js'
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
