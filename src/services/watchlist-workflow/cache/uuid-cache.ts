/**
 * UUID Cache Module
 *
 * Manages the in-memory cache mapping Plex UUIDs to database user IDs.
 * Used by RSS friend processing to resolve author UUIDs to user IDs.
 */

import type { UuidCacheDeps } from '../types.js'

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
  cache: Map<string, number>,
  deps: UuidCacheDeps,
): Promise<{ userId: number | null; cache: Map<string, number> }> {
  // Fast path: cache hit
  const cachedUserId = cache.get(uuid)
  if (cachedUserId !== undefined) {
    return { userId: cachedUserId, cache }
  }

  // Slow path: unknown UUID, refresh cache and retry
  deps.logger.info({ uuid }, 'Unknown UUID in friends RSS, refreshing cache')
  const updatedCache = await refreshPlexUuidCache(cache, deps)

  const userIdAfterRefresh = updatedCache.get(uuid)
  if (!userIdAfterRefresh) {
    deps.logger.info(
      { uuid },
      'RSS author not found in friends list - skipping',
    )
  }

  return { userId: userIdAfterRefresh ?? null, cache: updatedCache }
}

/**
 * Refresh the Plex UUID cache by re-fetching the friend list.
 *
 * @param currentCache - Current cache (used for logging comparison)
 * @param deps - Service dependencies
 * @returns Updated cache map
 */
export async function refreshPlexUuidCache(
  currentCache: Map<string, number>,
  deps: UuidCacheDeps,
): Promise<Map<string, number>> {
  try {
    const friendChanges = await deps.plexService.checkFriendChanges()
    const newCache = updatePlexUuidCache(friendChanges.userMap, deps)
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
 * @param userMap - Map of Plex UUID (watchlistId) to database user ID
 * @param deps - Service dependencies
 * @returns New cache map
 */
export function updatePlexUuidCache(
  userMap: Map<string, number>,
  deps: UuidCacheDeps,
): Map<string, number> {
  const newCache = new Map(userMap)
  deps.logger.debug({ cacheSize: newCache.size }, 'Updated Plex UUID cache')
  return newCache
}
