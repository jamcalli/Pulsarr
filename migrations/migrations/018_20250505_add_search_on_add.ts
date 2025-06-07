import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds the `search_on_add` column with a default value of true to the `radarr_instances` and `sonarr_instances` tables.
 *
 * @remarks
 * Introduces a configuration option to control whether automatic searches are performed when new content is added to Radarr or Sonarr. Existing rows are updated to ensure the new column is set to true by default.
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
 * Removes the `search_on_add` column from the `radarr_instances` and `sonarr_instances` tables.
 *
 * This function reverts the changes made by the corresponding migration's `up` function.
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
