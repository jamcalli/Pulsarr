import type { Knex } from 'knex'

/**
 * Adds the `minimum_availability` column to the `radarr_instances` table with a default value of 'released'.
 *
 * @remarks
 * This migration introduces a configuration option for Radarr instances to specify when movies are considered available. Possible values include 'announced', 'inCinemas', or 'released'.
 */
export async function up(knex: Knex): Promise<void> {
  // Add minimum_availability to radarr_instances
  await knex.schema.alterTable('radarr_instances', (table) => {
    // Add the minimum_availability column with a default value of 'released'
    table.string('minimum_availability').defaultTo('released')
  })

  // Set default values for existing rows that don't have the field
  await knex('radarr_instances')
    .whereNull('minimum_availability')
    .update({ minimum_availability: 'released' })
}

/**
 * Removes the `minimum_availability` column from the `radarr_instances` table, undoing the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('minimum_availability')
  })
}