/**
 * Friend Users Module
 *
 * Handles ensuring friend users exist in the database and
 * checking for removed friends that should be cleaned up.
 */

import type { Config } from '@root/types/config.types.js'
import type {
  EtagUserInfo,
  Friend,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { createDefaultQuotasForUser } from './token-users.js'

export interface FriendUsersDeps {
  config: Config
  db: DatabaseService
  logger: FastifyBaseLogger
  fastify: FastifyInstance
}

/**
 * Ensures friend users exist in the database and tracks newly added friends.
 *
 * @param friends - Set of friends from Plex API
 * @param deps - Service dependencies
 * @returns Promise resolving to userMap and list of added users
 */
export async function ensureFriendUsers(
  friends: Set<[Friend, string]>,
  deps: FriendUsersDeps,
): Promise<{ userMap: Map<string, UserMapEntry>; added: EtagUserInfo[] }> {
  const userMap = new Map<string, UserMapEntry>()
  const added: EtagUserInfo[] = []

  await Promise.all(
    Array.from(friends).map(async ([friend]) => {
      let user = await deps.db.getUser(friend.username)
      const isNewUser = !user

      if (!user) {
        user = await deps.db.createUser({
          name: friend.username,
          apprise: null,
          alias: null,
          discord_id: null,
          notify_apprise: false,
          notify_discord: false,
          notify_tautulli: false,
          tautulli_notifier_id: null,
          can_sync: deps.config.newUserDefaultCanSync ?? true,
          requires_approval:
            deps.config.newUserDefaultRequiresApproval ?? false,
          is_primary_token: false,
        })

        // Create default quotas for the new user
        await createDefaultQuotasForUser(user.id, deps)
      }

      if (!user.id) throw new Error(`No ID for user ${friend.username}`)
      userMap.set(friend.watchlistId, {
        userId: user.id,
        username: friend.username,
      })

      // Track newly added users for ETag baseline establishment
      if (isNewUser) {
        added.push({
          userId: user.id,
          username: friend.username,
          watchlistId: friend.watchlistId,
          isPrimary: false,
        })
      }
    }),
  )

  return { userMap, added }
}

/**
 * Checks for and removes users (friends) who are no longer in the current friends list.
 *
 * This method compares all existing users in the database (excluding the primary token user)
 * with the current friends list from Plex. Any users not found in the current friends list
 * are deleted from the database, which will cascade delete their watchlist items.
 *
 * @param currentFriends - Set of current friends from Plex API
 * @param deps - Service dependencies
 * @returns Promise resolving to list of removed users for ETag cache invalidation
 */
export async function checkForRemovedFriends(
  currentFriends: Set<[Friend, string]>,
  deps: FriendUsersDeps,
): Promise<EtagUserInfo[]> {
  const removed: EtagUserInfo[] = []

  try {
    // Get all users from database
    const allUsers = await deps.db.getAllUsers()

    // Get the primary user to exclude from cleanup
    const primaryUser = await deps.db.getPrimaryUser()

    // Create a set of current friend usernames for O(1) lookup (case-insensitive)
    const currentFriendUsernames = new Set(
      Array.from(currentFriends).map(([friend]) =>
        friend.username.toLowerCase(),
      ),
    )

    // Find users who are no longer friends (excluding primary user)
    const usersToDelete = allUsers.filter((user) => {
      // Never delete the primary user
      if (primaryUser && user.id === primaryUser.id) {
        return false
      }

      // Delete users who are not in the current friends list (case-insensitive comparison)
      return !currentFriendUsernames.has(user.name.toLowerCase())
    })

    if (usersToDelete.length > 0) {
      deps.logger.info(
        `Found ${usersToDelete.length} users who are no longer friends, removing them from database`,
      )

      // Delete users (this will cascade delete their watchlist items)
      const userIds = usersToDelete.map((user) => user.id)
      const result = await deps.db.deleteUsers(userIds)

      deps.logger.info(
        `Successfully removed ${result.deletedCount} former friends from database`,
      )

      // Log details of removed users for transparency
      const successfullyDeleted = usersToDelete.filter(
        (user) => !result.failedIds.includes(user.id),
      )

      for (const user of successfullyDeleted) {
        deps.logger.debug(
          `Removed former friend: ${user.name} (ID: ${user.id})`,
        )
        // Track removed users for ETag cache invalidation
        removed.push({
          userId: user.id,
          username: user.name,
          isPrimary: false,
        })
      }

      // Log any failures
      if (result.failedIds.length > 0) {
        const failedUsers = usersToDelete.filter((user) =>
          result.failedIds.includes(user.id),
        )
        deps.logger.warn(
          `Failed to remove ${result.failedIds.length} former friends: ${failedUsers.map((u) => u.name).join(', ')}`,
        )
      }
    } else {
      deps.logger.debug('No removed friends detected, database is up to date')
    }
  } catch (error) {
    deps.logger.error(
      { error },
      'Error checking for and removing former friends:',
    )
    // Don't throw - this is cleanup logic and shouldn't break the main flow
  }

  return removed
}
