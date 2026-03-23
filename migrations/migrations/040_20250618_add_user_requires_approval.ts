import type { Knex } from 'knex'

/**
 * Adds the `requires_approval` boolean column to the `users` table, defaulting to `false` and indexed for efficient filtering.
 *
 * This migration enables tracking whether a user requires approval for all content requests, supporting user-level approval enforcement.
 */
export async function up(knex: Knex): Promise<void> {
  // Add requires_approval field to users table
  await knex.schema.alterTable('users', (table) => {
    table.boolean('requires_approval').defaultTo(false)
    table.index(['requires_approval'])
  })
}

/**
 * Removes the `requires_approval` column and its index from the `users` table, undoing the migration changes.
 */
export async function down(knex: Knex): Promise<void> {
  // Remove requires_approval field from users table
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['requires_approval'])
    table.dropColumn('requires_approval')
  })
}
