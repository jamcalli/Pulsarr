import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 009_20250323_add_respect_user_sync_setting - PostgreSQL uses consolidated schema in migration 034')
    return
  }
await knex.schema.alterTable('configs', (table) => {
    table.boolean('respectUserSyncSetting').defaultTo(true)
    table.dropColumn('deleteIntervalDays')
  })

  await knex('configs')
    .whereNull('respectUserSyncSetting')
    .update({ respectUserSyncSetting: true })
}

export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('respectUserSyncSetting')
    table.integer('deleteIntervalDays')
  })
}