import type { Knex } from 'knex'

/**
 * Adds the `search_on_add` column to both Radarr and Sonarr instances tables with a default value of true.
 *
 * @remarks
 * This adds a new configuration option that allows users to control whether automatic searches are performed
 * when new content is added to Radarr or Sonarr.
 */
export async function up(knex: Knex): Promise<void> {
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
 * Reverts the migration by removing the `search_on_add` columns from both tables.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('search_on_add')
  })

  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('search_on_add')
  })
}