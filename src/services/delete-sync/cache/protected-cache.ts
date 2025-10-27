import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

/**
 * Ensures protection cache is loaded once per workflow
 * Avoids redundant API calls for protection playlist loading
 *
 * @param currentCache - The current protection cache (null if not loaded)
 * @param enabled - Whether protection is enabled
 * @param fastify - Fastify instance for accessing Plex server service
 * @param playlistName - Name of the protection playlist
 * @param logger - Logger instance for debug/error messages
 * @returns Set of protected GUIDs, or null if protection is disabled
 */
export async function ensureProtectionCache(
  currentCache: Set<string> | null,
  enabled: boolean,
  fastify: FastifyInstance,
  playlistName: string,
  logger: FastifyBaseLogger,
): Promise<Set<string> | null> {
  // Only load if protection is enabled
  if (!enabled) {
    return null
  }

  // Return cached value if already loaded
  if (currentCache !== null) {
    return currentCache
  }

  // Ensure Plex server is initialized
  if (!fastify.plexServerService.isInitialized()) {
    throw new Error(
      'Plex server not initialized for protection playlist access',
    )
  }

  try {
    logger.debug('Loading protection playlists and caching results...')

    // Create protection playlists for users if missing
    const playlistMap =
      await fastify.plexServerService.getOrCreateProtectionPlaylists(true)

    if (playlistMap.size === 0) {
      throw new Error(
        `Could not find or create protection playlists "${playlistName}" for any users - Plex server may be unreachable`,
      )
    }

    // Load and cache protected GUIDs
    const protectedGuids = await fastify.plexServerService.getProtectedItems()

    if (!protectedGuids) {
      throw new Error('Failed to retrieve protected items from playlists')
    }

    logger.debug(
      `Cached ${protectedGuids.size} protected item GUIDs from ${playlistMap.size} user playlists`,
    )

    return protectedGuids
  } catch (error) {
    logger.error({ error }, 'Error loading protection playlists for caching')
    throw error
  }
}

/**
 * Returns true if any of the provided GUIDs exist in the protected set.
 * Optional onHit callback lets callers log the first matching GUID.
 *
 * @param guidList - Array of GUIDs to check
 * @param protectedGuids - Set of protected GUIDs
 * @param enabled - Whether protection is enabled
 * @param onHit - Optional callback when a match is found
 * @returns True if any GUID is protected
 */
export function isAnyGuidProtected(
  guidList: string[],
  protectedGuids: Set<string> | null,
  enabled: boolean,
  onHit?: (guid: string) => void,
): boolean {
  if (!enabled || !protectedGuids) {
    return false
  }
  for (const guid of guidList) {
    if (protectedGuids.has(guid)) {
      onHit?.(guid)
      return true
    }
  }
  return false
}
