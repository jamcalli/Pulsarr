import type { Knex } from 'knex'

/**
 * Adds a `create_season_folders` column to the `sonarr_instances` table.
 *
 * The `create_season_folders` column is a boolean with a default value of `false` for backwards compatibility.
 * This setting controls whether Sonarr creates season folders for TV series.
 */
export async function up(knex: Knex): Promise<void> {
  // Add create_season_folders column to sonarr_instances table
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.boolean('create_season_folders').defaultTo(false)
  })
}

/**
 * Reverts the migration by dropping the `create_season_folders` column from the `sonarr_instances` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('create_season_folders')
  })
}
