// Public API exports for Plex integration functionality

// Basic API client functions
export { fetchPlexAvatar, pingPlex } from './api-client.js'
// Friends API
export { getFriends } from './friends-api.js'
// Helper functions and types
export {
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  type RateLimitError,
} from './helpers.js'
// Item processing
export {
  processWatchlistItems,
  toItemsBatch,
  toItemsSingle,
} from './item-processor.js'
// Rate limiter
export { PlexRateLimiter } from './rate-limiter.js'
// RSS functionality
export {
  fetchWatchlistFromRss,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from './rss.js'
// Watchlist API
export { getWatchlist, getWatchlistForUser } from './watchlist-api.js'
// High-level watchlist fetching
export { fetchSelfWatchlist, getOthersWatchlist } from './watchlist-fetcher.js'
