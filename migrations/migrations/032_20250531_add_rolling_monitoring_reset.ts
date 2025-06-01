import type { Knex } from 'knex'

/**
 * Applies a database migration to add and populate the `last_updated_at` column in the `rolling_monitored_shows` table.
 *
 * Adds a new nullable `last_updated_at` timestamp column, sets its value for existing records to match `updated_at`, then makes the column non-nullable and creates an index on it.
 */
export async function up(knex: Knex): Promise<void> {
  // First add the column as nullable
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.timestamp('last_updated_at').nullable()
  })

  // Update existing records to have last_updated_at = updated_at
  await knex('rolling_monitored_shows').update({
    last_updated_at: knex.ref('updated_at')
  })

  // Now make it not nullable and add index
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.timestamp('last_updated_at').notNullable().alter()
    table.index('last_updated_at')
  })
}

/**
 * Reverts the migration by removing the `last_updated_at` column and its index from the `rolling_monitored_shows` table.
 */
export async function down(knex: Knex): Promise<void> {
  // Remove the last_updated_at field and its index
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropIndex('last_updated_at')
    table.dropColumn('last_updated_at')
  })
}