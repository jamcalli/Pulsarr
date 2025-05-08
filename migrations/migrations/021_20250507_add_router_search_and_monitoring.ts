import type { Knex } from 'knex'

/**
 * Adds 'search_on_add' and 'season_monitoring' columns to the router_rules table for custom instance overrides.
 * 
 * This migration supports the content router's ability to override default instance settings on a per-route basis:
 * - search_on_add: For both Radarr and Sonarr routes, controls whether an automatic search is performed when content is added
 * - season_monitoring: For Sonarr routes only, specifies which seasons should be monitored (e.g., 'all', 'future', 'latest', etc.)
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
 * Reverts the migration by removing the 'search_on_add' and 'season_monitoring' columns from the router_rules table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('search_on_add')
    table.dropColumn('season_monitoring')
  })
}