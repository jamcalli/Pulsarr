import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Ensures tracked content cache is loaded once per workflow
 * Loads GUIDs from approval_requests table
 *
 * @param currentCache - The current tracked cache (null if not loaded)
 * @param enabled - Whether tracked-only deletion is enabled
 * @param dbService - Database service for loading GUIDs
 * @param logger - Logger instance for debug/error messages
 * @returns Set of tracked GUIDs, or null if tracked-only is disabled
 */
export async function ensureTrackedCache(
  currentCache: Set<string> | null,
  enabled: boolean,
  dbService: DatabaseService,
  logger: FastifyBaseLogger,
): Promise<Set<string> | null> {
  // Only load if tracked-only deletion is enabled
  if (!enabled) {
    return null
  }

  // Return cached value if already loaded
  if (currentCache !== null) {
    return currentCache
  }

  try {
    logger.debug('Loading tracked content GUIDs from approval requests...')

    // Get all GUIDs from approved and auto-approved requests
    const trackedGuids = await dbService.getTrackedContentGuids()

    logger.info(
      `Loaded ${trackedGuids.size} tracked content GUIDs from approval system`,
    )

    return trackedGuids
  } catch (error) {
    logger.error(
      { error },
      'Error loading tracked content GUIDs from approval requests',
    )
    throw error
  }
}

/**
 * Returns true if any of the provided GUIDs exist in the tracked set.
 * When deleteSyncTrackedOnly is enabled, only tracked content can be deleted.
 * Optional onHit callback lets callers log the first matching GUID.
 *
 * @param guidList - Array of GUIDs to check
 * @param trackedGuids - Set of tracked GUIDs
 * @param enabled - Whether tracked-only deletion is enabled
 * @param onHit - Optional callback when a match is found
 * @returns True if any GUID is tracked (or if tracked-only is disabled)
 */
export function isAnyGuidTracked(
  guidList: string[],
  trackedGuids: Set<string> | null,
  enabled: boolean,
  onHit?: (guid: string) => void,
): boolean {
  if (!enabled || !trackedGuids) {
    return true // If tracked-only is disabled, consider all content as tracked
  }
  for (const guid of guidList) {
    if (trackedGuids.has(guid)) {
      onHit?.(guid)
      return true
    }
  }
  return false
}
