import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('watchlistAddNotify').notNullable().defaultTo('all')
    table.boolean('notifyOnAvailability').notNullable().defaultTo(true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('watchlistAddNotify')
    table.dropColumn('notifyOnAvailability')
  })
}
