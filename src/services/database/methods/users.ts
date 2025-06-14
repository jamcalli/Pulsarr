import type { DatabaseService } from '@services/database.service.js'
import type { AdminUser } from '@schemas/auth/auth.js'
import type { User } from '@root/types/config.types.js'

/**
 * Creates a new user in the database
 *
 * @param userData - User data excluding id and timestamps
 * @returns Promise resolving to the created user with ID and timestamps
 */
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

  // Handle different return formats
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

/**
 * Retrieves a user by ID or name
 *
 * @param identifier - User ID (number) or username (string)
 * @returns Promise resolving to the user if found, undefined otherwise
 */
export async function getUser(
  this: DatabaseService,
  identifier: number | string,
): Promise<User | undefined> {
  const row = await this.knex('users')
    .where(
      typeof identifier === 'number'
        ? { id: identifier }
        : { name: identifier },
    )
    .first()

  if (!row) return undefined

  return {
    id: row.id,
    name: row.name,
    apprise: row.apprise,
    alias: row.alias,
    discord_id: row.discord_id,
    notify_apprise: Boolean(row.notify_apprise),
    notify_discord: Boolean(row.notify_discord),
    notify_tautulli: Boolean(row.notify_tautulli),
    tautulli_notifier_id: row.tautulli_notifier_id,
    can_sync: Boolean(row.can_sync),
    is_primary_token: Boolean(row.is_primary_token),
    created_at: row.created_at,
    updated_at: row.updated_at,
  } satisfies User
}

/**
 * Updates a user's information
 *
 * @param id - ID of the user to update
 * @param data - Partial user data to update
 * @returns Promise resolving to true if the user was updated, false otherwise
 */
export async function updateUser(
  this: DatabaseService,
  id: number,
  data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
): Promise<boolean> {
  const updated = await this.knex('users')
    .where({ id })
    .update({
      ...data,
      updated_at: this.timestamp,
    })
  return updated > 0
}

/**
 * Bulk updates multiple users with the same set of changes
 *
 * @param userIds - Array of user IDs to update
 * @param data - Partial user data to apply to all specified users
 * @returns Promise resolving to object with count of updated users and array of failed IDs
 */
export async function bulkUpdateUsers(
  this: DatabaseService,
  userIds: number[],
  data: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>,
): Promise<{ updatedCount: number; failedIds: number[] }> {
  const failedIds: number[] = []
  let updatedCount = 0

  try {
    // Start a transaction to ensure all updates are atomic
    await this.knex.transaction(async (trx) => {
      // Prepare the update data with timestamp
      const updateData = {
        ...data,
        updated_at: this.timestamp,
      }

      // For efficiency with large arrays, do batches
      const BATCH_SIZE = 50
      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batchIds = userIds.slice(i, i + BATCH_SIZE)

        try {
          // Use RETURNING if PostgreSQL, otherwise rely on affected rows count
          if (this.isPostgres) {
            // PostgreSQL: Use RETURNING to get exact IDs updated in single statement
            const updatedUsers = await trx('users')
              .whereIn('id', batchIds)
              .update(updateData)
              .returning('id')

            const updatedIds = updatedUsers.map((user) => user.id)
            updatedCount += updatedIds.length

            // Find failed IDs by comparing input vs returned IDs
            const missingIds = batchIds.filter((id) => !updatedIds.includes(id))
            failedIds.push(...missingIds)
          } else {
            // SQLite: Use affected rows count (safer within transaction)
            const result = await trx('users')
              .whereIn('id', batchIds)
              .update(updateData)

            updatedCount += result

            // For SQLite, if fewer rows affected than expected,
            // assume the difference represents non-existent IDs
            if (result < batchIds.length) {
              // Rather than re-querying (race condition), we'll log the discrepancy
              // In practice, this usually means some IDs don't exist in the table
              const missingCount = batchIds.length - result
              this.log.warn(
                `Bulk update: ${missingCount} IDs not found in batch`,
              )
              // Note: We can't easily determine which specific IDs failed in SQLite
              // without the race-condition-prone re-query, so we accept this limitation
            }
          }
        } catch (batchError) {
          this.log.error(`Error updating user batch: ${batchError}`)
          throw batchError
        }
      }
    })
  } catch (error) {
    this.log.error(`Error in bulk user update transaction: ${error}`)
    return { updatedCount: 0, failedIds: userIds }
  }

  this.log.info(
    `Bulk updated ${updatedCount} users, ${failedIds.length} failed`,
  )
  return { updatedCount, failedIds }
}

/**
 * Retrieves all users in the database
 *
 * @returns Promise resolving to an array of all users
 */
export async function getAllUsers(this: DatabaseService): Promise<User[]> {
  const rows = await this.knex('users').select('*').orderBy('name', 'asc')

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    apprise: row.apprise,
    alias: row.alias,
    discord_id: row.discord_id,
    notify_apprise: Boolean(row.notify_apprise),
    notify_discord: Boolean(row.notify_discord),
    notify_tautulli: Boolean(row.notify_tautulli),
    tautulli_notifier_id: row.tautulli_notifier_id,
    can_sync: Boolean(row.can_sync),
    is_primary_token: Boolean(row.is_primary_token),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })) satisfies User[]
}

/**
 * Retrieves all users with their watchlist item counts
 *
 * @returns Promise resolving to array of users with watchlist count property
 */
export async function getUsersWithWatchlistCount(
  this: DatabaseService,
): Promise<(User & { watchlist_count: number })[]> {
  const rows = await this.knex('users')
    .select([
      'users.*',
      this.knex.raw('COUNT(watchlist_items.id) as watchlist_count'),
    ])
    .leftJoin('watchlist_items', 'users.id', 'watchlist_items.user_id')
    .groupBy('users.id')
    .orderBy('users.name', 'asc')

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    apprise: row.apprise,
    alias: row.alias,
    discord_id: row.discord_id,
    notify_apprise: Boolean(row.notify_apprise),
    notify_discord: Boolean(row.notify_discord),
    notify_tautulli: Boolean(row.notify_tautulli),
    tautulli_notifier_id: row.tautulli_notifier_id,
    can_sync: Boolean(row.can_sync),
    is_primary_token: Boolean(row.is_primary_token),
    created_at: row.created_at,
    updated_at: row.updated_at,
    watchlist_count: Number(row.watchlist_count),
  })) satisfies (User & { watchlist_count: number })[]
}

/**
 * Retrieves the primary user from the database
 *
 * @returns Promise resolving to the primary user if found, undefined otherwise
 */
export async function getPrimaryUser(
  this: DatabaseService,
): Promise<User | undefined> {
  try {
    const row = await this.knex('users')
      .where({ is_primary_token: true })
      .first()

    if (!row) return undefined

    this.log.debug(
      { userId: row.id, username: row.name },
      'Retrieved primary user',
    )

    return {
      id: row.id,
      name: row.name,
      apprise: row.apprise,
      alias: row.alias,
      discord_id: row.discord_id,
      notify_apprise: Boolean(row.notify_apprise),
      notify_discord: Boolean(row.notify_discord),
      notify_tautulli: Boolean(row.notify_tautulli),
      tautulli_notifier_id: row.tautulli_notifier_id,
      can_sync: Boolean(row.can_sync),
      is_primary_token: Boolean(row.is_primary_token),
      created_at: row.created_at,
      updated_at: row.updated_at,
    } satisfies User
  } catch (error) {
    this.log.error({ error }, 'Error retrieving primary user')
    return undefined
  }
}

/**
 * Creates a new admin user in the database
 *
 * @param userData - Admin user data including email, username, password, and role
 * @returns Promise resolving to true if created successfully
 */
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
    this.log.error('Error creating admin user:', error)
    return false
  }
}

/**
 * Retrieves an admin user by email
 *
 * @param email - Email address of the admin user
 * @returns Promise resolving to the admin user if found, undefined otherwise
 */
export async function getAdminUser(
  this: DatabaseService,
  email: string,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .where({ email })
    .first()
}

/**
 * Retrieves an admin user by username
 *
 * @param username - Username of the admin user
 * @returns Promise resolving to the admin user if found, undefined otherwise
 */
export async function getAdminUserByUsername(
  this: DatabaseService,
  username: string,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .where({ username })
    .first()
}

/**
 * Checks if any admin users exist in the database
 *
 * @returns Promise resolving to true if admin users exist, false otherwise
 */
export async function hasAdminUsers(this: DatabaseService): Promise<boolean> {
  const count = await this.knex('admin_users').count('* as count').first()
  const numCount = Number(count?.count || 0)
  return !Number.isNaN(numCount) && numCount > 0
}

/**
 * Updates an admin user's password
 *
 * @param email - Email address of the admin user
 * @param hashedPassword - New hashed password
 * @returns Promise resolving to true if password was updated, false otherwise
 */
export async function updateAdminPassword(
  this: DatabaseService,
  email: string,
  hashedPassword: string,
): Promise<boolean> {
  try {
    const updated = await this.knex('admin_users').where({ email }).update({
      password: hashedPassword,
      updated_at: this.timestamp,
    })
    return updated > 0
  } catch (error) {
    this.log.error('Error updating admin password:', error)
    return false
  }
}

/**
 * Checks if any users have sync disabled
 *
 * @returns Promise resolving to true if any users have sync disabled, false otherwise
 */
export async function hasUsersWithSyncDisabled(
  this: DatabaseService,
): Promise<boolean> {
  try {
    const count = await this.knex('users')
      .where({ can_sync: false })
      .count('* as count')
      .first()

    return Number(count?.count || 0) > 0
  } catch (error) {
    this.log.error('Error checking for users with sync disabled:', error)
    return true
  }
}

/**
 * Sets a user as the primary token user, ensuring only one user has this flag
 *
 * This method clears the primary flag from all users before setting it on the specified user,
 * which ensures database consistency even if the unique constraint is not present.
 *
 * @param userId - ID of the user to set as primary
 * @returns Promise resolving to true if successful
 */
export async function setPrimaryUser(
  this: DatabaseService,
  userId: number,
): Promise<boolean> {
  try {
    await this.knex.transaction(async (trx) => {
      // Clear existing primary flags
      await trx('users').where({ is_primary_token: true }).update({
        is_primary_token: false,
        updated_at: this.timestamp,
      })

      // Set the new primary user
      await trx('users').where({ id: userId }).update({
        is_primary_token: true,
        updated_at: this.timestamp,
      })
    })

    this.log.info(`Set user ID ${userId} as the primary token user`)
    return true
  } catch (error) {
    this.log.error(`Error setting primary user ${userId}:`, error)
    return false
  }
}
