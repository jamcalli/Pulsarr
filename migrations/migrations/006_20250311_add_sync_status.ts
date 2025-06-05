import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 006_20250311_add_sync_status - PostgreSQL uses consolidated schema in migration 034')
    return
  }
await knex.schema.alterTable('watchlist_radarr_instances', (table) => {
    table.boolean('syncing').defaultTo(false).notNullable()
    table.index('syncing')
  })

  await knex.schema.alterTable('watchlist_sonarr_instances', (table) => {
    table.boolean('syncing').defaultTo(false).notNullable()
    table.index('syncing')
  })
}

export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  await knex.schema.alterTable('watchlist_radarr_instances', (table) => {
    table.dropColumn('syncing')
  })

  await knex.schema.alterTable('watchlist_sonarr_instances', (table) => {
    table.dropColumn('syncing')
  })
}