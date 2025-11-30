// Re-exports from new location for backward compatibility
// TODO: Update all imports to use @services/plex-watchlist/ directly, then remove this file

// API layer
export {
  fetchPlexAvatar,
  pingPlex,
} from '@services/plex-watchlist/api/client.js'
export {
  getWatchlist,
  getWatchlistForUser,
} from '@services/plex-watchlist/api/graphql.js'
export {
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  type RateLimitError,
} from '@services/plex-watchlist/api/helpers.js'
export { PlexRateLimiter } from '@services/plex-watchlist/api/rate-limiter.js'
// Enrichment/processing
export {
  processWatchlistItems,
  toItemsBatch,
  toItemsSingle,
} from '@services/plex-watchlist/enrichment/index.js'
// ETag polling
export { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
// Fetching layer
export { getFriends } from '@services/plex-watchlist/fetching/friends-api.js'
export {
  fetchWatchlistFromRss,
  getPlexWatchlistUrls,
  getRssFromPlexToken,
} from '@services/plex-watchlist/fetching/rss-fetcher.js'
export {
  fetchSelfWatchlist,
  getOthersWatchlist,
} from '@services/plex-watchlist/fetching/watchlist-fetcher.js'
