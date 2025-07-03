import type { DatabaseService } from '@services/database.service.js'
import type { AdminUser } from '@schemas/auth/auth.js'
import type { User } from '@root/types/config.types.js'

/**
 * Database row representation for users table
 */
interface UserRow {
  id: number
  name: string
  apprise: string | null
  alias: string | null
  discord_id: string | null
  notify_apprise: boolean | number
  notify_discord: boolean | number
  notify_tautulli: boolean | number
  tautulli_notifier_id: number | null
  can_sync: boolean | number
  requires_approval: boolean | number
  is_primary_token: boolean | number
  created_at: string
  updated_at: string
}

/**
 * Converts a UserRow database record into a User object, normalizing boolean fields.
 *
 * Ensures that fields such as notification flags, sync permissions, approval requirements, and primary token status are represented as booleans in the returned User object.
 *
 * @param row - The UserRow database record to convert
 * @returns The corresponding User object with normalized fields
 */
function mapRowToUser(row: UserRow): User {
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
    requires_approval: Boolean(row.requires_approval),
    is_primary_token: Boolean(row.is_primary_token),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Inserts a new user into the database and returns the created user with assigned ID and timestamps.
 *
 * @param userData - User information to be stored, excluding ID and timestamp fields.
 * @returns The newly created user object, including its database ID and creation/update timestamps.
 * @throws If the user ID cannot be extracted after insertion.
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
 * Retrieves a user by numeric ID or username.
 *
 * @param identifier - The user ID or username to search for.
 * @returns The user object if found, otherwise undefined.
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

  return mapRowToUser(row)
}

/**
 * Updates the specified user's information with the provided data.
 *
 * @param id - The ID of the user to update
 * @param data - The fields to update for the user
 * @returns True if at least one user was updated; false if no matching user was found
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
 * Updates multiple users in batches with the specified changes.
 *
 * Processes user IDs in batches within a transaction, applying the same partial update to each user. Returns the total number of users updated and an array of IDs that could not be updated (precise failed IDs are only available when using PostgreSQL).
 *
 * @param userIds - The IDs of users to update
 * @param data - The partial user data to apply to each user
 * @returns An object containing the count of updated users and an array of failed user IDs
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
 * Retrieves all users from the database, ordered by name.
 *
 * @returns An array of all users.
 */
export async function getAllUsers(this: DatabaseService): Promise<User[]> {
  const rows = await this.knex('users').select('*').orderBy('name', 'asc')

  return rows.map((row) => mapRowToUser(row))
}

/**
 * Retrieves all users along with the count of their associated watchlist items.
 *
 * @returns An array of user objects, each extended with a `watchlist_count` property indicating the number of watchlist items linked to the user.
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
    ...mapRowToUser(row),
    watchlist_count: Number(row.watchlist_count),
  })) satisfies (User & { watchlist_count: number })[]
}

/**
 * Retrieves the user marked as the primary token user.
 *
 * @returns The primary user if found, otherwise undefined.
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

    return mapRowToUser(row)
  } catch (error) {
    this.log.error({ error }, 'Error retrieving primary user')
    return undefined
  }
}

/**
 * Inserts a new admin user into the database.
 *
 * @param userData - Object containing the email, username, password, and role for the new admin user.
 * @returns True if the admin user was created successfully; otherwise, false.
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
 * Retrieves an admin user by email address using a case-insensitive match.
 *
 * @param email - The email address to search for.
 * @returns The matching admin user if found; otherwise, undefined.
 */
export async function getAdminUser(
  this: DatabaseService,
  email: string,
): Promise<AdminUser | undefined> {
  return await this.knex('admin_users')
    .select('id', 'username', 'email', 'password', 'role')
    .whereRaw('LOWER(email) = LOWER(?)', [email])
    .first()
}

/**
 * Retrieves an admin user by their username.
 *
 * @param username - The username to search for.
 * @returns The admin user if found, otherwise undefined.
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
 * Determines whether any admin users are present in the database.
 *
 * @returns True if at least one admin user exists; otherwise, false.
 */
export async function hasAdminUsers(this: DatabaseService): Promise<boolean> {
  const count = await this.knex('admin_users').count('* as count').first()
  const numCount = Number(count?.count || 0)
  return !Number.isNaN(numCount) && numCount > 0
}

/**
 * Updates the password for an admin user matching the given email address, using a case-insensitive comparison.
 *
 * @param email - The email address of the admin user to update
 * @param hashedPassword - The new hashed password to set
 * @returns True if the password was updated for at least one user; false if no matching user was found or an error occurred
 */
export async function updateAdminPassword(
  this: DatabaseService,
  email: string,
  hashedPassword: string,
): Promise<boolean> {
  try {
    const updated = await this.knex('admin_users')
      .whereRaw('LOWER(email) = LOWER(?)', [email])
      .update({
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
 * Checks if any user has synchronization disabled.
 *
 * Returns `true` if at least one user has `can_sync` set to false, or if an error occurs during the check; otherwise, returns `false`.
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
 * Determines whether any users or system configurations require approval or quota processing.
 *
 * Returns `true` if at least one user has `requires_approval` enabled, if any user quotas exist, or if any router rules are configured to require approval or bypass user quotas. Returns `true` on error as a conservative default.
 *
 * @returns `true` if approval or quota configuration is present; otherwise, `false`.
 */
export async function hasUsersWithApprovalConfig(
  this: DatabaseService,
): Promise<boolean> {
  try {
    // Check if any users have requires_approval = true
    const usersRequiringApproval = await this.knex('users')
      .where({ requires_approval: true })
      .count('* as count')
      .first()

    if (Number(usersRequiringApproval?.count || 0) > 0) {
      return true
    }

    // Check if any user quotas exist
    const quotaCount = await this.knex('user_quotas')
      .count('* as count')
      .first()

    if (Number(quotaCount?.count || 0) > 0) {
      return true
    }

    // Check if any router rules have approval actions enabled
    const approvalRulesCount = await this.knex('router_rules')
      .where({ always_require_approval: true })
      .orWhere({ bypass_user_quotas: true })
      .count('* as count')
      .first()

    return Number(approvalRulesCount?.count || 0) > 0
  } catch (error) {
    this.log.error(
      'Error checking for users with approval configuration:',
      error,
    )
    return true // Conservative: assume we have approval config on error
  }
}

/**
 * Sets the specified user as the primary token user, ensuring only one user has this status.
 *
 * Clears the primary flag from all users before assigning it to the given user to maintain consistency.
 *
 * @param userId - The ID of the user to designate as primary
 * @returns True if the operation succeeds, false otherwise
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
