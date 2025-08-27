import type { Knex } from 'knex'

/**
 * Makes the user_id column nullable in the plex_label_tracking table to support system operations.
 *
 * This allows system-generated label tracking operations (like removed label markers) to use NULL
 * for user_id instead of requiring a specific user reference, avoiding foreign key constraint issues
 * while maintaining data integrity for user-specific operations.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('plex_label_tracking', (table) => {
    table.integer('user_id').nullable().alter()
  })
}

/**
 * Reverts the migration by making user_id not nullable again.
 *
 * Note: This rollback will fail if there are any NULL user_id records in the table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('plex_label_tracking', (table) => {
    table.integer('user_id').notNullable().alter()
  })
}
