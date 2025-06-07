import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds a `series_type` column to the `sonarr_instances` and `router_rules` tables.
 *
 * @remarks
 * This migration is skipped for PostgreSQL databases.
 * In `sonarr_instances`, the `series_type` column is a non-nullable string with a default value of `'standard'`.
 * In `router_rules`, the column is nullable to allow per-rule overrides.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '025_20250514_add_series_type_to_sonarr')) {
    return
  }
  // Add series_type column to sonarr_instances table
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.string('series_type').defaultTo('standard')
  })

  // Add series_type column to router_rules table for overrides
  await knex.schema.alterTable('router_rules', (table) => {
    table.string('series_type').nullable()
  })
}

/**
 * Reverts the migration by dropping the `series_type` column from both `sonarr_instances` and `router_rules` tables.
 *
 * @remark This operation is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('series_type')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('series_type')
  })
}
