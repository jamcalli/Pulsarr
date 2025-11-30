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
export { EtagPoller, type EtagUserInfo } from './etag/index.js'
// Fetching layer
export {
  fetchSelfWatchlist,
  fetchWatchlistFromRss,
  getFriends,
  getOthersWatchlist,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from './fetching/index.js'
