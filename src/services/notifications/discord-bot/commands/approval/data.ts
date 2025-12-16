/**
 * Approval Command Data Access
 *
 * Database query functions for the approval command.
 * Each function defines its own minimal deps interface.
 */

import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface DataDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

/**
 * Get user by Discord ID
 */
export async function getUserByDiscordId(
  discordId: string,
  deps: DataDeps,
): Promise<User | null> {
  try {
    const user = await deps.db.getUserByDiscordId(discordId)
    return user ?? null
  } catch (error) {
    deps.log.error({ error, discordId }, 'Error getting user by Discord ID')
    return null
  }
}

/**
 * Check if Discord user is the primary admin
 */
export async function checkUserIsPrimary(
  discordUserId: string,
  deps: DataDeps,
): Promise<boolean> {
  try {
    const user = await getUserByDiscordId(discordUserId, deps)
    return user?.is_primary_token === true
  } catch (error) {
    deps.log.error(
      { error, discordUserId },
      'Error checking primary user status',
    )
    return false
  }
}

/**
 * Get admin user record from Discord ID
 * Returns user id and name if the user is a primary admin
 */
export async function getAdminUserFromDiscord(
  discordUserId: string,
  deps: DataDeps,
): Promise<{ id: number; name: string } | null> {
  try {
    const user = await getUserByDiscordId(discordUserId, deps)

    if (!user || !user.is_primary_token) {
      return null
    }

    return {
      id: user.id,
      name: user.name,
    }
  } catch (error) {
    deps.log.error(
      { error, discordUserId },
      'Error getting admin user from Discord',
    )
    return null
  }
}

/**
 * Get poster URL for an approval request from watchlist items
 */
export async function getPosterUrl(
  contentKey: string,
  deps: DataDeps,
): Promise<string | undefined> {
  try {
    const watchlistItems = await deps.db.getWatchlistItemsByKeys([contentKey])
    if (watchlistItems.length > 0 && watchlistItems[0].thumb) {
      return watchlistItems[0].thumb
    }
    return undefined
  } catch (_error) {
    // Silently ignore poster lookup errors
    return undefined
  }
}
