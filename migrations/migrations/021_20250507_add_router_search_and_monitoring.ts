import type { Knex } from 'knex'

/**
 * Adds `search_on_add` and `season_monitoring` columns to the `router_rules` table.
 *
 * Introduces a nullable boolean column `search_on_add` for controlling automatic search behavior on Radarr and Sonarr routes, and a nullable string column `season_monitoring` for specifying season monitoring preferences on Sonarr routes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    // Add search_on_add column (nullable boolean)
    table.boolean('search_on_add').nullable()
    
    // Add season_monitoring column (nullable string) for Sonarr routes
    table.string('season_monitoring').nullable()
  })
}

/**
 * Reverts the migration by dropping the 'search_on_add' and 'season_monitoring' columns from the 'router_rules' table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('search_on_add')
    table.dropColumn('season_monitoring')
  })
}