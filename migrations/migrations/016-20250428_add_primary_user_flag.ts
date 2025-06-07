import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Applies a migration to add the `is_primary_token` column to the `users` table, creates a unique index for primary token users, and sets the first user named "token1" as the primary token user if found.
 *
 * @remark
 * The unique index `idx_unique_primary_token` enforces that only one user can have `is_primary_token` set to true in SQLite databases.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '016-20250428_add_primary_user_flag')) {
    return
  }
  // Add the column first
  await knex.schema.alterTable('users', (table) => {
    // Add a flag to identify the primary token user
    table.boolean('is_primary_token').defaultTo(false)
  })

  // For SQLite, create a unique index that only applies when is_primary_token = true
  await knex.raw(`
    CREATE UNIQUE INDEX idx_unique_primary_token ON users (is_primary_token) 
    WHERE is_primary_token = 1
  `)

  // Set the first user named "token1" as primary if it exists
  const token1User = await knex('users').where('name', 'token1').first()
  if (token1User) {
    console.log(
      `Setting existing token1 user (ID: ${token1User.id}) as primary token user`,
    )
    await knex('users')
      .where('id', token1User.id)
      .update({ is_primary_token: true })
  } else {
    console.log(
      'No "token1" user found, skipping primary user setup in migration',
    )
  }
}

/**
 * Rolls back the migration by removing the `is_primary_token` column and its unique index from the `users` table.
 *
 * @remark
 * This operation is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  // Drop the unique index
  await knex.raw('DROP INDEX IF EXISTS idx_unique_primary_token')

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_primary_token')
  })
}
