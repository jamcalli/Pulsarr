import type { Knex } from 'knex'

/**
 * Adds the `create_season_folders` boolean column to the `sonarr_instances` table.
 *
 * The new column defaults to `false` and determines whether Sonarr creates season folders for TV series.
 */
export async function up(knex: Knex): Promise<void> {
  // Add create_season_folders column to sonarr_instances table
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.boolean('create_season_folders').defaultTo(false)
  })
}

/**
 * Removes the `create_season_folders` column from the `sonarr_instances` table, reverting the schema change introduced by the corresponding migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('create_season_folders')
  })
}
