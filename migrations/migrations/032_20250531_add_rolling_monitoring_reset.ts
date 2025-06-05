import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Applies a migration that adds and initializes the `last_updated_at` column in the `rolling_monitored_shows` table.
 *
 * Adds a nullable `last_updated_at` timestamp column, populates it with values from `updated_at` for existing rows, then alters the column to be non-nullable and creates an index on it.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '032_20250531_add_rolling_monitoring_reset')) {
    return
  }
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
 * Reverts the migration by dropping the `last_updated_at` column and its index from the `rolling_monitored_shows` table.
 */
export async function down(knex: Knex): Promise<void> {
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  // Remove the last_updated_at field and its index
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropIndex('last_updated_at')
    table.dropColumn('last_updated_at')
  })
}