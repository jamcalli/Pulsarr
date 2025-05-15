import type { Knex } from 'knex'

/**
 * Adds the suppressRepairNotifications boolean column to the configs table.
 *
 * The new column is not nullable and defaults to false.
 */
export async function up(knex: Knex): Promise<void> {
  // Add suppress_repair_notifications to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('suppressRepairNotifications').defaultTo(false).notNullable()
  })
}

/**
 * Reverts the migration by removing the `suppressRepairNotifications` column from the `configs` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('suppressRepairNotifications')
  })
}