import type { Knex } from 'knex'

/**
 * Adds user_id column to api_keys table and associates all existing API keys with an admin user.
 *
 * This migration enables API key authentication to populate req.session.user, which is required
 * for approval endpoints that need to track which user performed actions.
 *
 * BEHAVIOR:
 * - Fresh installs (no admin users): Creates column as nullable, defers user assignment
 * - Existing installs: Finds first admin/superadmin user and assigns all API keys to them
 *
 * SAFETY: Handles both fresh installations and existing systems gracefully.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if any admin users exist at all
  const adminCount = await knex('admin_users').count('* as count').first()
  const hasAdmins = Number(adminCount?.count || 0) > 0

  // Count existing API keys for logging
  const existingApiKeys = await knex('api_keys').count('* as count').first()
  const apiKeyCount = Number(existingApiKeys?.count || 0)

  if (!hasAdmins) {
    console.log(
      '⚠️  No admin users found - this appears to be a fresh installation',
    )
    console.log(
      '   Creating user_id column as nullable - API keys will be assigned when admin users are created',
    )

    await knex.schema.alterTable('api_keys', (table) => {
      // Add user_id column as nullable for fresh installs
      table.integer('user_id').nullable()
      table
        .foreign('user_id')
        .references('id')
        .inTable('admin_users')
        .onDelete('CASCADE')

      // Add index for efficient user-based API key queries
      table.index(['user_id'], 'idx_api_keys_user_id')
    })

    console.log(
      `✓ Migration completed for fresh install: Created user_id column for ${apiKeyCount} API key(s)`,
    )
    return
  }

  // Existing installation: Find first admin user
  const adminUser = await knex('admin_users')
    .where('role', 'admin')
    .orderBy('id', 'asc')
    .first()

  if (!adminUser) {
    throw new Error(
      'Migration failed: No admin user found. ' +
        'Cannot proceed with API key user association.',
    )
  }

  console.log(
    `✓ Found admin user: ${adminUser.username} (ID: ${adminUser.id}, Role: ${adminUser.role})`,
  )

  console.log(
    `✓ Associating ${apiKeyCount} existing API key(s) with admin user`,
  )

  await knex.schema.alterTable('api_keys', (table) => {
    // Add user_id column with default to the found admin user
    table.integer('user_id').notNullable().defaultTo(adminUser.id)
    table
      .foreign('user_id')
      .references('id')
      .inTable('admin_users')
      .onDelete('CASCADE')

    // Add index for efficient user-based API key queries
    table.index(['user_id'], 'idx_api_keys_user_id')
  })

  // Ensure all existing API keys are assigned to the admin user
  // This handles any edge case where defaultTo() might not apply to existing rows
  const updatedRows = await knex('api_keys')
    .update({ user_id: adminUser.id })
    .whereNull('user_id')

  console.log(
    `✓ Migration completed: Associated ${apiKeyCount} API key(s) with admin user ${adminUser.username}`,
  )

  if (updatedRows > 0) {
    console.log(
      `✓ Updated ${updatedRows} existing API key(s) with user_id = ${adminUser.id}`,
    )
  }
}

/**
 * Reverts the migration by removing the user_id column and its associated index/foreign key.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropForeign(['user_id'])
    table.dropIndex('idx_api_keys_user_id')
    table.dropColumn('user_id')
  })

  console.log('✓ Reverted: Removed user_id column from api_keys table')
}
