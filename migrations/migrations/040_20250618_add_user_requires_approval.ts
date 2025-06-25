import type { Knex } from 'knex'

/**
 * Adds a boolean `requires_approval` column to the `users` table to indicate if a user requires approval for all content requests.
 *
 * The new column defaults to `false` and is indexed to optimize queries filtering by approval requirement. This migration enables user-level approval enforcement, independent of quota or router rules.
 */
export async function up(knex: Knex): Promise<void> {
  // Add requires_approval field to users table
  await knex.schema.alterTable('users', (table) => {
    table.boolean('requires_approval').defaultTo(false)
    table.index(['requires_approval'])
  })
}

/**
 * Reverts the migration by removing the `requires_approval` column and its index from the `users` table.
 */
export async function down(knex: Knex): Promise<void> {
  // Remove requires_approval field from users table
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['requires_approval'])
    table.dropColumn('requires_approval')
  })
}
