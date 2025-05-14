import type { Knex } from 'knex'

/**
 * Adds a `series_type` column to the `sonarr_instances` and `router_rules` tables.
 *
 * @remarks
 * In `sonarr_instances`, the `series_type` column is a non-nullable string with a default value of `'standard'`. In `router_rules`, the column is nullable to support per-rule overrides.
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
 * Removes the `series_type` column from the `sonarr_instances` and `router_rules` tables.
 *
 * This function reverses the schema changes introduced by the corresponding migration, restoring the tables to their previous structure.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('series_type')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('series_type')
  })
}