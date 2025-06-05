import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Alters the `router_rules` table by adding `search_on_add` (nullable boolean) and `season_monitoring` (nullable string) columns.
 *
 * The `search_on_add` column is intended to control automatic search behavior for Radarr and Sonarr routes, while `season_monitoring` specifies season monitoring preferences for Sonarr routes.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '021_20250507_add_router_search_and_monitoring')) {
    return
  }
await knex.schema.alterTable('router_rules', (table) => {
    // Add search_on_add column (nullable boolean)
    table.boolean('search_on_add').nullable()
    
    // Add season_monitoring column (nullable string) for Sonarr routes
    table.string('season_monitoring').nullable()
  })
}

/**
 * Removes the 'search_on_add' and 'season_monitoring' columns from the 'router_rules' table to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('search_on_add')
    table.dropColumn('season_monitoring')
  })
}
