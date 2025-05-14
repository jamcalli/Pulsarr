import type { Knex } from 'knex'

/**
 * Adds the `series_type` column to the `sonarr_instances` table.
 * 
 * @remarks
 * This migration adds support for configuring the series type (standard, anime, daily)
 * for Sonarr instances, allowing automatic assignment of the correct series type
 * when adding content to Sonarr.
 */
export async function up(knex: Knex): Promise<void> {
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
 * Removes the `series_type` columns from the `sonarr_instances` and `router_rules` tables.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('series_type')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('series_type')
  })
}