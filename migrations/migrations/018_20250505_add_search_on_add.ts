import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds the `search_on_add` boolean column with a default value of true to both `radarr_instances` and `sonarr_instances` tables.
 *
 * @remarks
 * Skips execution for PostgreSQL databases. Updates existing rows to ensure the new column is set to true where it was previously null.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '018_20250505_add_search_on_add')) {
    return
  }
  // Add search_on_add to radarr_instances
  await knex.schema.alterTable('radarr_instances', (table) => {
    // Add the search_on_add column with a default value of true
    table.boolean('search_on_add').defaultTo(true)
  })

  // Add search_on_add to sonarr_instances
  await knex.schema.alterTable('sonarr_instances', (table) => {
    // Add the search_on_add column with a default value of true
    table.boolean('search_on_add').defaultTo(true)
  })

  // Set default values for existing rows that don't have the field
  await knex('radarr_instances')
    .whereNull('search_on_add')
    .update({ search_on_add: true })

  await knex('sonarr_instances')
    .whereNull('search_on_add')
    .update({ search_on_add: true })
}

/**
 * Reverts the migration by removing the `search_on_add` column from both `radarr_instances` and `sonarr_instances` tables.
 *
 * @remark
 * This operation is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('search_on_add')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('search_on_add')
  })
}
