/**
 * Content Cache Module
 *
 * Provides functions for caching content availability checks on Plex servers.
 * Cache is reconciliation-scoped (cleared at start of each cycle, no TTL).
 * All functions are pure and receive cache state as parameters.
 */

import type { PlexSearchResponse } from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { CachedConnection } from './connection-cache.js'
import { invalidateServerConnection } from './connection-cache.js'

/**
 * Type guard for PlexSearchResponse
 * Validates the shape of the response from Plex API
 */
function isPlexSearchResponse(data: unknown): data is PlexSearchResponse {
  if (typeof data !== 'object' || data === null) {
    return false
  }
  if (!('MediaContainer' in data)) {
    return false
  }
  const container = data.MediaContainer
  if (typeof container !== 'object' || container === null) {
    return false
  }
  // MediaContainer exists, Metadata is optional (can be undefined or array)
  if (!('Metadata' in container)) {
    return true // Metadata is optional
  }
  return Array.isArray(container.Metadata) || container.Metadata === undefined
}

/** Cached content availability entry */
export interface CachedContentAvailability {
  exists: boolean
  serverName: string
}

/** Dependencies for content cache operations */
export interface ContentCacheDeps {
  logger: FastifyBaseLogger
}

/**
 * Builds a cache key for content availability lookup.
 *
 * @param serverClientId - Unique identifier for the server
 * @param contentType - The content type ("movie" or "show")
 * @param plexGuid - The full Plex GUID (e.g., "plex://movie/abc123")
 * @returns Cache key string
 */
export function buildContentCacheKey(
  serverClientId: string,
  contentType: 'movie' | 'show',
  plexGuid: string,
): string {
  const plexKey = plexGuid.split('/').pop() || plexGuid
  if (!plexKey) {
    throw new Error(`Invalid plexGuid: ${plexGuid}`)
  }
  return `${serverClientId}:${contentType}:${plexKey}`
}

/**
 * Gets cached content availability if present.
 *
 * @param cacheKey - The cache key to look up
 * @param contentCache - Map of cached content availability
 * @returns Cached result or undefined if not cached
 */
export function getCachedContentAvailability(
  cacheKey: string,
  contentCache: Map<string, CachedContentAvailability>,
): CachedContentAvailability | undefined {
  return contentCache.get(cacheKey)
}

/**
 * Clears the content cache at the start of each reconciliation.
 * Content cache is reconciliation-scoped, not TTL-based.
 *
 * @param contentCache - Map of cached content availability
 * @param logger - Logger instance
 */
export function clearContentCacheForReconciliation(
  contentCache: Map<string, CachedContentAvailability>,
  logger: FastifyBaseLogger,
): void {
  const previousSize = contentCache.size
  contentCache.clear()
  if (previousSize > 0) {
    logger.debug(
      `Cleared ${previousSize} content cache entries for new reconciliation`,
    )
  }
}

/**
 * Checks if content exists on a specific server with caching and failover handling.
 * Uses the content availability cache (reconciliation-scoped).
 * On connection failure, invalidates the cached connection for automatic re-selection.
 *
 * @param serverClientId - Unique identifier for the server
 * @param serverName - Human-readable server name for logging
 * @param serverUri - The server URI to connect to
 * @param accessToken - Token to use for authentication
 * @param plexGuid - The full Plex GUID (e.g., "plex://movie/abc123")
 * @param contentType - The content type ("movie" or "show")
 * @param contentCache - Map of cached content availability
 * @param connectionCache - Map of cached connections (for invalidation on failure)
 * @param deps - Service dependencies
 * @param abortSignal - Optional abort signal for early termination
 * @returns true if content exists on this server, false otherwise
 */
export async function checkContentOnServer(
  serverClientId: string,
  serverName: string,
  serverUri: string,
  accessToken: string,
  plexGuid: string,
  contentType: 'movie' | 'show',
  contentCache: Map<string, CachedContentAvailability>,
  connectionCache: Map<string, CachedConnection>,
  deps: ContentCacheDeps,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  const { logger } = deps

  // Build cache key
  const cacheKey = buildContentCacheKey(serverClientId, contentType, plexGuid)

  // Check cache first (no TTL check - cache is cleared per reconciliation)
  const cached = getCachedContentAvailability(cacheKey, contentCache)
  if (cached !== undefined) {
    logger.debug(
      `Cache HIT for ${contentType} on "${cached.serverName}": ${cached.exists ? 'exists' : 'not found'}`,
    )
    return cached.exists
  }

  // Make API call
  try {
    const url = new URL('/library/all', serverUri)
    url.searchParams.append('guid', plexGuid)

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': accessToken,
        'X-Plex-Client-Identifier': 'Pulsarr',
      },
      signal: abortSignal
        ? AbortSignal.any([AbortSignal.timeout(5000), abortSignal])
        : AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      // Server error - might be connection issue, invalidate cached connection
      if (response.status >= 500) {
        invalidateServerConnection(serverClientId, connectionCache, logger)
      }
      return false
    }

    const data: unknown = await response.json()
    if (!isPlexSearchResponse(data)) {
      logger.debug(
        { server: serverName },
        'Invalid response format from Plex server',
      )
      return false
    }
    const exists = (data.MediaContainer?.Metadata?.length ?? 0) > 0

    // Cache the result (no timestamp needed - cleared per reconciliation)
    contentCache.set(cacheKey, {
      exists,
      serverName,
    })

    if (exists) {
      logger.debug(`Content found on Plex server "${serverName}"`)
    }

    return exists
  } catch (error) {
    // Check if aborted (found on another server)
    if (error instanceof Error && error.name === 'AbortError') {
      logger.debug(
        `Content check aborted for server "${serverName}" (found elsewhere)`,
      )
      return false
    }

    // Network error - invalidate cached connection for this server
    logger.debug(
      { error, server: serverName },
      'Error checking content on server',
    )
    invalidateServerConnection(serverClientId, connectionCache, logger)
    return false
  }
}
