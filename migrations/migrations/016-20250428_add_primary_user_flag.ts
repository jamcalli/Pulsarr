import type { Knex } from 'knex'

/**
 * Applies the migration to add the `is_primary_token` column to the `users` table and creates a unique index for rows where this flag is true.
 *
 * @remark
 * The unique index `idx_unique_primary_token` enforces that only one user can have `is_primary_token` set to true in SQLite databases.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    // Add a flag to identify the primary token user
    table.boolean('is_primary_token').defaultTo(false)
    
  })
  
  // For SQLite, create a unique index that only applies when is_primary_token = true
  await knex.raw(`
    CREATE UNIQUE INDEX idx_unique_primary_token ON users (is_primary_token) 
    WHERE is_primary_token = 1
  `)
}

/**
 * Reverts the migration by removing the `is_primary_token` column from the `users` table and dropping the associated unique index.
 */
export async function down(knex: Knex): Promise<void> {
  // Drop the unique index
  await knex.raw(`DROP INDEX IF EXISTS idx_unique_primary_token`)
  
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_primary_token')
  })
}