import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('respectUserSyncSetting').defaultTo(true)
    table.dropColumn('deleteIntervalDays')
  })

  await knex('configs')
    .whereNull('respectUserSyncSetting')
    .update({ respectUserSyncSetting: true })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('respectUserSyncSetting')
    table.integer('deleteIntervalDays')
  })
}