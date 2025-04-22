import type { Knex } from 'knex'

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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sonarr_instances', (table) => {
    table.dropColumn('monitor_new_items')
  })
}