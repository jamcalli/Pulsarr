import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds `search_on_add` (nullable boolean) and `season_monitoring` (nullable string) columns to the `router_rules` table.
 *
 * @remark This migration is skipped for PostgreSQL databases based on the result of {@link shouldSkipForPostgreSQL}.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(
      knex,
      '021_20250507_add_router_search_and_monitoring',
    )
  ) {
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
 * Reverts the migration by dropping the 'search_on_add' and 'season_monitoring' columns from the 'router_rules' table.
 *
 * @remark
 * This operation is skipped for PostgreSQL databases based on the result of {@link shouldSkipDownForPostgreSQL}.
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
