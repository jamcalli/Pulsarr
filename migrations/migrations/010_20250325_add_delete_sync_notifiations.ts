import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.string('deleteSyncNotify').defaultTo('none')
    table.integer('maxDeletionPrevention').defaultTo(10)
  })
  
  await knex('configs')
    .whereNull('deleteSyncNotify')
    .update({ deleteSyncNotify: 'none' })
  
  await knex('configs')
    .whereNull('maxDeletionPrevention')
    .update({ maxDeletionPrevention: 10 })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotify')
    table.dropColumn('maxDeletionPrevention')
  })
}