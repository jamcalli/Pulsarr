import type { UserStats } from '@root/schemas/users/user-stats.schema.js'
import type { User } from '@root/types/config.types.js'
import type { WatchlistStatus } from '@root/types/watchlist-status.types.js'
import type { AdminUser } from '@schemas/auth/auth.js'
import { mapRowToUser } from '@services/database/user-rows.js'
import type { DatabaseService } from '@services/database.service.js'

export async function createUser(
  this: DatabaseService,
  userData: Omit<User, 'id' | 'created_at' | 'updated_at'>,
): Promise<User> {
  const result = await this.knex('users')
    .insert({
      ...userData,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .returning('id')

  const id = this.extractId(result)

  if (id === undefined || id === null) {
    throw new Error('Failed to create user')
  }

  const user: User = {
    ...userData,
    id: Number(id),
    created_at: this.timestamp,
    updated_at: this.timestamp,
  }

  return user
}

/** Safe under concurrent callers, which converge on the same row instead of inserting duplicates. */
export async function getOrCreateUser(
  this: DatabaseService,
  userData: Omit<User, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ user: User; created: boolean }> {
  const inserted = await this.knex('users')
    .insert({
      ...userData,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    .onConflict('name')
    .ignore()
    .returning('id')

  const user = await this.getUser(userData.name)
  if (!user) {
    throw new Error(`Failed to get or create user ${userData.name}`)
  }

  return { user, created: inserted.length > 0 }
}

/** Never returns the system user (id <= 0). */
export async function getUser(
  this: DatabaseService,
  identifier: number | string,
): Promise<User | undefined> {
  const row = await this.knex('users')
    .modify((qb) => {
      if (typeof identifier === 'number') {
        qb.where({ id: identifier })
      } else {
        qb.where({ name: identifier })
      }
    })
    .andWhere('id', '>', 0)
    .first()

  if (!row) return undefined

  return mapRowToUser(row)
}

export async function getUserByDiscordId(
  this: DatabaseService,
  discordId: string,
): Promise<User | undefined> {
  const row = await this.knex('users')
    .where({ discord_id: discordId })
    .andWhere('id', '>', 0)
    .first()

  if (!row) return undefined

  return mapRowToUser(row)
}

/** Refuses the system user (id <= 0) and returns false. */
export async function updateUser(
  this: DatabaseService,
  id: number,
  data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
): Promise<boolean> {
  if (id <= 0) {
    this.log.warn('Refusing to update system user (ID <= 0)')
    return false
  }
  const updated = await this.knex('users')
    .where({ id })
    .update({
      ...data,
      updated_at: this.timestamp,
    })
  return updated > 0
}

/** Rolls back and reports every id as failed on any error, and only Postgres can name the ids that matched no row. */
export async function bulkUpdateUsers(
  this: DatabaseService,
  userIds: number[],
  data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
): Promise<{ updatedCount: number; failedIds: number[] }> {
  const failedIds: number[] = []
  let updatedCount = 0

  try {
    await this.knex.transaction(async (trx) => {
      const updateData = {
        ...data,
        updated_at: this.timestamp,
      }

      const BATCH_SIZE = 50
      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batchIds = userIds.slice(i, i + BATCH_SIZE).filter((id) => id > 0)
        if (batchIds.length === 0) continue

        try {
          if (this.isPostgres) {
            const updatedUsers = await trx('users')
              .whereIn('id', batchIds)
              .update(updateData)
              .returning('id')

            const updatedIds = updatedUsers.map((user) => user.id)
            updatedCount += updatedIds.length

            const missingIds = batchIds.filter((id) => !updatedIds.includes(id))
            failedIds.push(...missingIds)
          } else {
            const result = await trx('users')
              .whereIn('id', batchIds)
              .update(updateData)

            updatedCount += result

            // SQLite has no RETURNING here, so missing ids are counted but never named
            if (result < batchIds.length) {
              const missingCount = batchIds.length - result
              this.log.warn(
                `Bulk update: ${missingCount} IDs not found in batch`,
              )
            }
          }
        } catch (batchError) {
          this.log.error({ error: batchError }, 'Error updating user batch')
          throw batchError
        }
      }
    })
  } catch (error) {
    this.log.error({ error }, 'Error in bulk user update transaction')
    return { updatedCount: 0, failedIds: userIds }
  }

  this.log.info(
    `Bulk updated ${updatedCount} users, ${failedIds.length} failed`,
  )
  return { updatedCount, failedIds }
}

/** Never returns the system user (id <= 0). */
export async function getUsersByIds(
  this: DatabaseService,
  userIds: number[],
): Promise<User[]> {
  if (userIds.length === 0) return []

  const rows = await this.knex('users')
    .whereIn('id', userIds)
    .andWhere('id', '>', 0)

  return rows.map((row) => mapRowToUser(row))
}

/** Excludes the system user (id <= 0). */
export async function getAllUsers(this: DatabaseService): Promise<User[]> {
  const rows = await this.knex('users')
    .select('*')
    .where('id', '>', 0)
    .orderBy('name', 'asc')

  return rows.map((row) => mapRowToUser(row))
}

/** Excludes the system user (id <= 0). */
export async function getUsersWithWatchlistCount(
  this: DatabaseService,
): Promise<(User & { watchlist_count: number })[]> {
  const rows = await this.knex('users')
    .select([
      'users.*',
      this.knex.raw('COUNT(watchlist_items.id) as watchlist_count'),
    ])
    .leftJoin('watchlist_items', 'users.id', 'watchlist_items.user_id')
    .where('users.id', '>', 0)
    .groupBy('users.id')
    .orderBy('users.name', 'asc')

  return rows.map((row) => ({
    ...mapRowToUser(row),
    watchlist_count: Number(row.watchlist_count),
  })) satisfies (User & { watchlist_count: number })[]
}

/** Excludes the system user and returns undefined on query error. */
export async function getPrimaryUser(
  this: DatabaseService,
): Promise<User | undefined> {
  try {
    const row = await this.knex('users')
      .where({ is_primary_token: true })
      .andWhere('id', '>', 0)
      .first()

    if (!row) return undefined

    this.log.debug(
      { userId: row.id, username: row.name },
      'Retrieved primary user',
    )

    return mapRowToUser(row)
  } catch (error) {
    this.log.error({ error }, 'Error retrieving primary user')
    return undefined
  }
}

/** Swallows errors and returns false. */
export async function createAdminUser(
  this: DatabaseService,
  userData: {
    email: string
    username: string
    password: string
    role: string
  },
): Promise<boolean> {
  try {
    await this.knex('admin_users').insert({
      ...userData,
      created_at: this.timestamp,
      updated_at: this.timestamp,
    })
    return true
  } catch (error) {
    this.log.error({ error }, 'Error creating admin user:')
    return false
  }
}

export async function getAdminUserById(
  this: DatabaseService,
  id: number,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .where({ id })
    .first()
}

/** Matches the email case-insensitively. */
export async function getAdminUserByEmail(
  this: DatabaseService,
  email: string,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .whereRaw('LOWER(email) = LOWER(?)', [email])
    .first()
}

/** Matches the username case-insensitively. */
export async function getAdminUserByUsername(
  this: DatabaseService,
  username: string,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .whereRaw('LOWER(username) = LOWER(?)', [username])
    .first()
}

export async function hasAdminUsers(this: DatabaseService): Promise<boolean> {
  const count = await this.knex('admin_users').count('* as count').first()
  const numCount = Number(count?.count || 0)
  return !Number.isNaN(numCount) && numCount > 0
}

/** The app enforces a single admin account, so this is the only row. */
export async function getAdminUser(
  this: DatabaseService,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .first()
}

/** Returns false when no row matched or the query failed. */
export async function updateAdminPassword(
  this: DatabaseService,
  id: number,
  hashedPassword: string,
): Promise<boolean> {
  try {
    const updated = await this.knex('admin_users').where({ id }).update({
      password: hashedPassword,
      updated_at: this.timestamp,
    })
    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating admin password:')
    return false
  }
}

/** Returns false when no row matched or the query failed. */
export async function updateAdminEmail(
  this: DatabaseService,
  id: number,
  newEmail: string,
): Promise<boolean> {
  try {
    const updated = await this.knex('admin_users').where({ id }).update({
      email: newEmail,
      updated_at: this.timestamp,
    })
    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating admin email:')
    return false
  }
}

/** Returns false when no row matched or the query failed. */
export async function updateAdminUsername(
  this: DatabaseService,
  id: number,
  newUsername: string,
): Promise<boolean> {
  try {
    const updated = await this.knex('admin_users').where({ id }).update({
      username: newUsername,
      updated_at: this.timestamp,
    })
    return updated > 0
  } catch (error) {
    this.log.error({ error }, 'Error updating admin username:')
    return false
  }
}

/** Refuses the system user, clears every other primary flag in one transaction, and returns false on refusal or error. */
export async function setPrimaryUser(
  this: DatabaseService,
  userId: number,
): Promise<boolean> {
  if (userId <= 0) {
    this.log.warn('Refusing to set system user (ID <= 0) as primary')
    return false
  }
  try {
    await this.knex.transaction(async (trx) => {
      await trx('users').where({ is_primary_token: true }).update({
        is_primary_token: false,
        updated_at: this.timestamp,
      })

      await trx('users').where({ id: userId }).update({
        is_primary_token: true,
        updated_at: this.timestamp,
      })
    })

    this.log.info(`Set user ID ${userId} as the primary token user`)
    return true
  } catch (error) {
    this.log.error({ error }, `Error setting primary user ${userId}:`)
    return false
  }
}

/** Skips the system user, and on SQLite failedIds stays empty because the misses cannot be named. */
export async function deleteUsers(
  this: DatabaseService,
  userIds: number[],
): Promise<{ deletedCount: number; failedIds: number[] }> {
  if (userIds.length === 0) {
    return { deletedCount: 0, failedIds: [] }
  }

  try {
    if (this.isPostgres) {
      const deletedUsers = await this.knex('users')
        .whereIn('id', userIds)
        .andWhere('id', '>', 0)
        .del()
        .returning('id')

      const deletedIds = deletedUsers.map((user) => user.id)
      const failedIds = userIds.filter((id) => !deletedIds.includes(id))

      this.log.debug(
        `Deleted ${deletedIds.length} users out of ${userIds.length} requested`,
      )

      if (failedIds.length > 0) {
        this.log.debug(
          `Failed to delete ${failedIds.length} users: ${failedIds.join(', ')}`,
        )
      }

      const result = { deletedCount: deletedIds.length, failedIds }
      this.log.info(
        `Bulk deleted ${result.deletedCount} users, ${result.failedIds.length} failed`,
      )
      return result
    } else {
      // SQLite returns only a count here, so failed ids cannot be named
      const deletedCount = await this.knex('users')
        .whereIn('id', userIds)
        .andWhere('id', '>', 0)
        .del()

      this.log.debug(
        `Deleted ${deletedCount} users out of ${userIds.length} requested`,
      )

      const failedCount = userIds.length - deletedCount
      if (failedCount > 0) {
        this.log.debug(
          `${failedCount} users were not deleted (may not have existed)`,
        )
      }

      const result = { deletedCount, failedIds: [] as number[] }
      this.log.info(
        `Bulk deleted ${result.deletedCount} users, ${result.failedIds.length} failed (SQLite cannot enumerate failed IDs)`,
      )
      return result
    }
  } catch (error) {
    this.log.error({ error, userIds }, 'Error deleting users:')
    return { deletedCount: 0, failedIds: userIds }
  }
}

/** All-time counts with no date window. */
export async function getUserStats(
  this: DatabaseService,
  userId: number,
): Promise<UserStats> {
  const [statusRows, notificationRow, approvalRow] = await Promise.all([
    this.knex('watchlist_items')
      .select('status')
      .count('* as count')
      .where('user_id', userId)
      .groupBy('status'),
    this.knex('notifications')
      .count('* as count')
      .where('user_id', userId)
      .first(),
    this.knex('approval_requests')
      .count('* as count')
      .where({ user_id: userId, status: 'pending' })
      .first(),
  ])

  const watchlist: Record<WatchlistStatus, number> = {
    pending: 0,
    requested: 0,
    grabbed: 0,
    notified: 0,
  }
  let total = 0
  for (const row of statusRows) {
    const count = Number(row.count)
    watchlist[row.status as WatchlistStatus] = count
    total += count
  }

  return {
    watchlist: { ...watchlist, total },
    notificationsSent: Number(notificationRow?.count ?? 0),
    pendingApprovals: Number(approvalRow?.count ?? 0),
  }
}
