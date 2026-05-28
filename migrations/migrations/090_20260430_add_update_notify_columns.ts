import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('notifyOnUpdate').notNullable().defaultTo('none')
    table.string('lastNotifiedVersion').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('lastNotifiedVersion')
    table.dropColumn('notifyOnUpdate')
  })
}
