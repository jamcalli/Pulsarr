/**
 * User Permissions Module
 *
 * Handles user sync permission checking with caching to avoid repeated DB lookups.
 */

import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface PermissionsDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

// Module-level caches for user sync permissions
const userCanSyncCache = new Map<number, boolean>()
const userCanSyncInFlight = new Map<number, Promise<boolean>>()

/**
 * Gets user sync permission with caching to avoid repeated DB lookups
 *
 * @param userId - The user ID to check
 * @param deps - Service dependencies
 * @returns Promise resolving to boolean indicating if user can sync
 */
export async function getUserCanSync(
  userId: number,
  deps: PermissionsDeps,
): Promise<boolean> {
  const cached = userCanSyncCache.get(userId)
  if (cached !== undefined) return cached

  const inflight = userCanSyncInFlight.get(userId)
  if (inflight) return inflight

  const p = (async () => {
    try {
      const dbUser = await deps.db.getUser(userId)
      const canSync = dbUser?.can_sync ?? false
      userCanSyncCache.set(userId, canSync)
      return canSync
    } catch (error) {
      deps.logger.error(
        { error, userId },
        'Failed to fetch user can_sync; treating as disabled',
      )
      userCanSyncCache.set(userId, false)
      return false
    } finally {
      userCanSyncInFlight.delete(userId)
    }
  })()

  userCanSyncInFlight.set(userId, p)
  return p
}

/**
 * Clears the user sync permission cache.
 * Call this when permissions may have changed or at the start of a new operation.
 */
export function clearUserCanSyncCache(): void {
  userCanSyncCache.clear()
}

/**
 * Gets the current size of the permission cache (for debugging/monitoring)
 */
export function getPermissionCacheSize(): number {
  return userCanSyncCache.size
}
