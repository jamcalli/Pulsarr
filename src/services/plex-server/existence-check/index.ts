/**
 * Existence Check Module Index
 *
 * Exports all functions and types for Plex content existence checking
 * with connection and content caching support.
 */

// Connection cache exports
export {
  type CachedConnection,
  type ConnectionCacheDeps,
  type ConnectionCandidate,
  type ConnectionResult,
  getBestServerConnection,
  getCachedConnection,
  invalidateServerConnection,
  isServerInBackoff,
} from './connection-cache.js'

// Content cache exports
export {
  buildContentCacheKey,
  type CachedContentAvailability,
  type ContentCacheDeps,
  checkContentOnServer,
  clearContentCacheForReconciliation,
  getCachedContentAvailability,
} from './content-cache.js'

// Server list builder exports
export {
  buildUniqueServerList,
  type ServerListBuilderDeps,
  type ServerToCheck,
} from './server-list-builder.js'
