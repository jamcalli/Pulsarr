import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add suppress_repair_notifications to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('suppressRepairNotifications').defaultTo(false).notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('suppressRepairNotifications')
  })
}