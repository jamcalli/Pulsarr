import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds the `monitor_new_items` column to the `sonarr_instances` table with a default value of `'all'`.
 *
 * @remark
 * This migration is skipped for PostgreSQL databases.
 * Existing rows with `monitor_new_items` set to `NULL` are updated to `'all'`.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '014_20250425_add_monitor_new_items')) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    // Add the monitor_new_items column with a default value of 'all'
    table.string('monitor_new_items').defaultTo('all')
  })

  // Set default values for existing rows that don't have the field
  await knex('sonarr_instances')
    .whereNull('monitor_new_items')
    .update({ monitor_new_items: 'all' })
}

/**
 * Removes the `monitor_new_items` column from the `sonarr_instances` table if the migration is not skipped for PostgreSQL.
 *
 * @remark
 * This operation is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('monitor_new_items')
  })
}
