import type { Knex } from 'knex'

/**
 * Adds the `monitor_new_items` column to the `sonarr_instances` table with a default value of `'all'`.
 *
 * @remark
 * Updates existing rows where `monitor_new_items` is `NULL` to `'all'` to maintain data consistency.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    // Add the monitor_new_items column with a default value of 'all'
    table.string('monitor_new_items').defaultTo('all')
  })

  // Set default values for existing rows that don't have the field
  await knex('sonarr_instances')
    .whereNull('monitor_new_items')
    .update({ monitor_new_items: 'all' })
}

/**
 * Drops the `monitor_new_items` column from the `sonarr_instances` table to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('monitor_new_items')
  })
}