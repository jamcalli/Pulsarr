import type { User } from '@root/types/config.types.js'
import type { UpdateUser } from '@schemas/users/users.schema.js'
import type { DatabaseService } from '@services/database.service.js'
import { isUniqueViolation } from '@utils/db-errors.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export interface UserUpdateDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  httpErrors: FastifyInstance['httpErrors']
  /** Runs after rows were written, with every id that may have changed. */
  onUpdated(userIds: readonly number[]): void
}

export interface BulkUserUpdateResult {
  updatedCount: number
  failedIds: number[]
}

/** Throws 404 for an unknown user and 409 when the new name is taken. */
export async function updateUser(
  userId: number,
  updates: UpdateUser,
  deps: UserUpdateDeps,
): Promise<User> {
  const { db, httpErrors } = deps
  const existingUser = await db.getUser(userId)
  if (!existingUser) throw httpErrors.notFound('User not found')

  if (updates.name && updates.name !== existingUser.name) {
    if (await db.getUser(updates.name)) {
      throw httpErrors.conflict('User with this name already exists')
    }
  }

  try {
    if (!(await db.updateUser(userId, updates))) {
      throw new Error('Failed to update user')
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw httpErrors.conflict('User with this name already exists')
    }
    throw error
  }
  deps.onUpdated([userId])

  const updatedUser = await db.getUser(userId)
  if (!updatedUser) throw new Error('Failed to fetch updated user')
  return updatedUser
}

/** Notification switches are only turned on for users with the matching Discord ID or Apprise URL. */
export async function bulkUpdateUsers(
  userIds: number[],
  updates: UpdateUser,
  deps: UserUpdateDeps,
): Promise<BulkUserUpdateResult> {
  const { db, logger } = deps
  const isUpdatingNotifications =
    updates.notify_apprise !== undefined || updates.notify_discord !== undefined

  if (!isUpdatingNotifications) {
    try {
      return await db.bulkUpdateUsers(userIds, updates)
    } finally {
      deps.onUpdated(userIds)
    }
  }

  const failedIds: number[] = []
  let updatedCount = 0
  for (const userId of userIds) {
    try {
      const user = await db.getUser(userId)
      if (!user) {
        failedIds.push(userId)
        continue
      }

      const userUpdates = { ...updates }
      if (updates.notify_apprise && !user.apprise) {
        userUpdates.notify_apprise = false
      }
      if (updates.notify_discord && !user.discord_id) {
        userUpdates.notify_discord = false
      }

      if (await db.updateUser(userId, userUpdates)) {
        updatedCount++
      } else {
        failedIds.push(userId)
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update individual user')
      failedIds.push(userId)
    }
  }
  deps.onUpdated(userIds)

  return { updatedCount, failedIds }
}
