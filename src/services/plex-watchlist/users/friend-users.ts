import type { Config, User } from '@root/types/config.types.js'
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

/** Creates a DB user and default quotas per unstored friend; `added` holds only those new users. */
export async function ensureFriendUsers(
  friends: Set<[Friend, string]>,
  deps: FriendUsersDeps,
): Promise<{ userMap: Map<string, UserMapEntry>; added: EtagUserInfo[] }> {
  const userMap = new Map<string, UserMapEntry>()
  const added: EtagUserInfo[] = []
  const allUsers = await deps.db.getAllUsers()
  const usersByUuid = new Map(
    allUsers
      .filter((user) => user.plex_uuid)
      .map((user) => [user.plex_uuid, user]),
  )
  const usersByName = new Map(allUsers.map((user) => [user.name, user]))

  await Promise.all(
    Array.from(friends).map(async ([friend]) => {
      const existing = usersByUuid.get(friend.watchlistId)
      const { user, created } = existing
        ? { user: existing, created: false }
        : await deps.db.getOrCreateUser({
            name: friend.username,
            apprise: null,
            alias: null,
            discord_id: null,
            notify_apprise: false,
            notify_discord: false,
            notify_discord_mention: true,
            notify_plex_mobile: false,
            can_sync: deps.config.newUserDefaultCanSync ?? true,
            requires_approval:
              deps.config.newUserDefaultRequiresApproval ?? false,
            is_primary_token: false,
            plex_uuid: friend.watchlistId,
            avatar: friend.avatar ?? null,
            display_name: friend.displayName ?? null,
            friend_created_at: friend.createdAt ?? null,
          })

      if (created) {
        void deps.fastify.notifications.sendUserCreated(user)

        await createDefaultQuotasForUser(user.id, deps)
      } else {
        const updates: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>> =
          {}
        if (user.name !== friend.username) {
          const holder = usersByName.get(friend.username)
          if (holder && holder.id !== user.id) {
            deps.logger.warn(
              {
                userId: user.id,
                username: friend.username,
                holderId: holder.id,
              },
              'Username is still held by another user, keeping the stored name',
            )
          } else {
            updates.name = friend.username
          }
        }
        if (friend.watchlistId && user.plex_uuid !== friend.watchlistId) {
          updates.plex_uuid = friend.watchlistId
        }
        if (friend.avatar !== undefined && user.avatar !== friend.avatar) {
          updates.avatar = friend.avatar ?? null
        }
        if (
          friend.displayName !== undefined &&
          user.display_name !== friend.displayName
        ) {
          updates.display_name = friend.displayName ?? null
        }
        if (
          friend.createdAt !== undefined &&
          user.friend_created_at !== friend.createdAt
        ) {
          updates.friend_created_at = friend.createdAt ?? null
        }
        if (Object.keys(updates).length > 0) {
          await deps.db.updateUser(user.id, updates)
        }
      }

      if (!user.id) throw new Error(`No ID for user ${friend.username}`)
      userMap.set(friend.watchlistId, {
        userId: user.id,
        username: friend.username,
      })

      if (created) {
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

/** Deletes DB users who are no longer friends; never throws, and returns only rows actually deleted. */
export async function checkForRemovedFriends(
  currentFriends: Set<[Friend, string]>,
  deps: FriendUsersDeps,
): Promise<EtagUserInfo[]> {
  const removed: EtagUserInfo[] = []

  try {
    const allUsers = await deps.db.getAllUsers()

    const primaryUser = await deps.db.getPrimaryUser()

    const currentFriendUsernames = new Set(
      Array.from(currentFriends).map(([friend]) =>
        friend.username.toLowerCase(),
      ),
    )

    const currentFriendUuids = new Set(
      Array.from(currentFriends)
        .map(([friend]) => friend.watchlistId)
        .filter(Boolean),
    )

    const usersToDelete = allUsers.filter((user) => {
      if (primaryUser && user.id === primaryUser.id) {
        return false
      }

      if (user.plex_uuid) {
        return !currentFriendUuids.has(user.plex_uuid)
      }

      return !currentFriendUsernames.has(user.name.toLowerCase())
    })

    if (usersToDelete.length > 0) {
      deps.logger.info(
        `Found ${usersToDelete.length} users who are no longer friends, removing them from database`,
      )

      const userIds = usersToDelete.map((user) => user.id)
      const result = await deps.db.deleteUsers(userIds)

      deps.logger.info(
        `Successfully removed ${result.deletedCount} former friends from database`,
      )

      const successfullyDeleted = usersToDelete.filter(
        (user) => !result.failedIds.includes(user.id),
      )

      for (const user of successfullyDeleted) {
        deps.logger.debug(
          `Removed former friend: ${user.name} (ID: ${user.id})`,
        )
        removed.push({
          userId: user.id,
          username: user.name,
          isPrimary: false,
        })
      }

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
