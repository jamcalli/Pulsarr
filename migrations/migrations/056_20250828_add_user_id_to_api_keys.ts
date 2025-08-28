import type { Knex } from 'knex'

/**
 * Adds user_id column to api_keys table and associates all existing API keys with admin user (ID 1).
 *
 * This migration enables API key authentication to populate req.session.user, which is required
 * for approval endpoints that need to track which user performed actions.
 *
 * SAFETY: Validates that user ID 1 exists and has admin role before proceeding with migration.
 * All existing API keys are automatically assigned to the validated admin user.
 */
export async function up(knex: Knex): Promise<void> {
  // First, validate that user ID 1 exists and is an admin
  const adminUser = await knex('admin_users')
    .where('id', 1)
    .andWhere('role', 'admin')
    .first()

  if (!adminUser) {
    throw new Error(
      'Migration failed: Admin user with ID 1 not found or does not have admin role. ' +
        'Cannot proceed with API key user association.',
    )
  }

  console.log(
    `✓ Validated admin user: ${adminUser.username} (ID: ${adminUser.id}, Role: ${adminUser.role})`,
  )

  // Count existing API keys for logging
  const existingApiKeys = await knex('api_keys').count('* as count').first()
  const apiKeyCount = Number(existingApiKeys?.count || 0)

  console.log(
    `✓ Found ${apiKeyCount} existing API key(s) to associate with admin user`,
  )

  await knex.schema.alterTable('api_keys', (table) => {
    // Add user_id column with foreign key reference to admin_users
    table.integer('user_id').notNullable().defaultTo(1)
    table
      .foreign('user_id')
      .references('id')
      .inTable('admin_users')
      .onDelete('CASCADE')

    // Add index for efficient user-based API key queries
    table.index('user_id')
  })

  // Ensure all existing API keys are assigned to admin user (ID 1)
  // This handles any edge case where defaultTo(1) might not apply to existing rows
  const updatedRows = await knex('api_keys')
    .update({ user_id: 1 })
    .whereNull('user_id')

  console.log(
    `✓ Migration completed: Associated ${apiKeyCount} API key(s) with admin user ${adminUser.username}`,
  )

  if (updatedRows > 0) {
    console.log(`✓ Updated ${updatedRows} existing API key(s) with user_id = 1`)
  }
}

/**
 * Reverts the migration by removing the user_id column and its associated index/foreign key.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropForeign(['user_id'])
    table.dropIndex(['user_id'])
    table.dropColumn('user_id')
  })

  console.log('✓ Reverted: Removed user_id column from api_keys table')
}
