import type { Knex } from 'knex'

/**
 * Adds the `monitor` column to the `radarr_instances` and `router_rules` tables.
 *
 * @remarks
 * This migration adds the Radarr monitor option which controls how movies are monitored
 * when added. Valid values are 'movieOnly', 'movieAndCollection', or 'none'.
 * This is analogous to Sonarr's `season_monitoring` field.
 */
export async function up(knex: Knex): Promise<void> {
  // Add monitor to radarr_instances with default 'movieOnly'
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.string('monitor', 20).defaultTo('movieOnly')
  })

  // Add monitor to router_rules (nullable for per-route override)
  await knex.schema.alterTable('router_rules', (table) => {
    table.string('monitor', 20).nullable()
  })

  // Set default values for existing radarr_instances rows
  await knex('radarr_instances')
    .whereNull('monitor')
    .update({ monitor: 'movieOnly' })
}

/**
 * Reverts the migration by dropping the `monitor` column from both tables.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('monitor')
  })

  await knex.schema.alterTable('router_rules', (table) => {
    table.dropColumn('monitor')
  })
}
