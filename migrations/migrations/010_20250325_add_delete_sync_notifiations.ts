import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('deleteSyncNotify').defaultTo('none')
  })

  await knex('configs')
    .whereNull('deleteSyncNotify')
    .update({ deleteSyncNotify: 'none' })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotify')
  })
}