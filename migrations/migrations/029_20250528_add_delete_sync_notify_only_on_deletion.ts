import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add deleteSyncNotifyOnlyOnDeletion to configs table
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('deleteSyncNotifyOnlyOnDeletion').defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotifyOnlyOnDeletion')
  })
}