import type { Knex } from 'knex'

/**
 * Adds the `minimum_availability` column to the `radarr_instances` table with a default value of 'released'.
 *
 * @remarks
 * This migration introduces a configuration option for Radarr instances to specify when movies are considered available. Possible values include 'announced', 'inCinemas', or 'released'.
 */
export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 020_20250506_add_minimum_availability - PostgreSQL uses consolidated schema in migration 034')
    return
  }
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
 * Removes the `minimum_availability` column from the `radarr_instances` table.
 *
 * Reverses the migration applied in the `up` function.
 */
export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.alterTable('radarr_instances', (table) => {
    table.dropColumn('minimum_availability')
  })
}