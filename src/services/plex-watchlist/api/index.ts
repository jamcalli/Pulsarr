// API layer exports for Plex watchlist service

// Client functions (ping, avatar)
export { fetchPlexAvatar, pingPlex } from './client.js'

// GraphQL/REST API functions
export { getWatchlist, getWatchlistForUser } from './graphql.js'

// Helper functions and types
export {
  hasValidPlexTokens,
  isRateLimitError,
  PLEX_API_TIMEOUT_MS,
  type RateLimitError,
} from './helpers.js'

// Rate limiter
export { PlexRateLimiter } from './rate-limiter.js'
