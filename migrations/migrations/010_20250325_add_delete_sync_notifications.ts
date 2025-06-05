import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 010_20250325_add_delete_sync_notifications - PostgreSQL uses consolidated schema in migration 034')
    return
  }
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
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncNotify')
    table.dropColumn('maxDeletionPrevention')
  })
}