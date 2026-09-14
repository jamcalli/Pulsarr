/**
 * UUID Cache Module
 *
 * Manages the in-memory cache mapping Plex UUIDs to database user IDs.
 * Used by RSS friend processing to resolve author UUIDs to user IDs.
 */

import type { UserMapEntry } from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { WorkflowDeps } from '../types.js'

/**
 * Look up user ID by Plex UUID from the cache.
 * If not found, refreshes the cache and retries.
 *
 * @param uuid - Plex UUID (author field from RSS)
 * @param cache - Current UUID cache map
 * @param deps - Service dependencies
 * @returns User ID if found, null otherwise. Also returns updated cache.
 */
export async function lookupUserByUuid(
  uuid: string,
  cache: Map<string, UserMapEntry>,
  deps: Pick<WorkflowDeps, 'logger' | 'plexService'>,
): Promise<{ userId: number | null; cache: Map<string, UserMapEntry> }> {
  // Fast path: cache hit
  const cachedEntry = cache.get(uuid)
  if (cachedEntry !== undefined) {
    return { userId: cachedEntry.userId, cache }
  }

  // Slow path: unknown UUID, refresh cache and retry
  deps.logger.info({ uuid }, 'Unknown UUID in friends RSS, refreshing cache')
  const updatedCache = await refreshPlexUuidCache(cache, deps)

  const entryAfterRefresh = updatedCache.get(uuid)
  if (!entryAfterRefresh) {
    deps.logger.info(
      { uuid },
      'RSS author not found in friends list - skipping',
    )
  }

  return { userId: entryAfterRefresh?.userId ?? null, cache: updatedCache }
}

/**
 * Refresh the Plex UUID cache by re-fetching the friend list.
 *
 * @param currentCache - Current cache (used for logging comparison)
 * @param deps - Service dependencies
 * @returns Updated cache map
 */
export async function refreshPlexUuidCache(
  currentCache: Map<string, UserMapEntry>,
  deps: Pick<WorkflowDeps, 'logger' | 'plexService'>,
): Promise<Map<string, UserMapEntry>> {
  try {
    const friendChanges = await deps.plexService.checkFriendChanges()
    const newCache = updatePlexUuidCache(friendChanges.userMap, deps.logger)
    deps.logger.debug({ cacheSize: newCache.size }, 'Plex UUID cache refreshed')
    return newCache
  } catch (error) {
    deps.logger.error({ error }, 'Failed to refresh Plex UUID cache')
    // Return current cache on error to avoid data loss
    return currentCache
  }
}

/**
 * Update the UUID cache with a fresh userMap.
 * Called whenever friend sync operations return a fresh userMap.
 *
 * @param userMap - Map of Plex UUID (watchlistId) to user info
 * @param logger - Logger instance
 * @returns New cache map
 */
export function updatePlexUuidCache(
  userMap: Map<string, UserMapEntry>,
  logger: FastifyBaseLogger,
): Map<string, UserMapEntry> {
  const newCache = new Map(userMap)
  logger.debug({ cacheSize: newCache.size }, 'Updated Plex UUID cache')
  return newCache
}
