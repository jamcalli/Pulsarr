import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
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
  await knex.schema.alterTable('watchlist_radarr_instances', (table) => {
    table.dropColumn('syncing')
  })

  await knex.schema.alterTable('watchlist_sonarr_instances', (table) => {
    table.dropColumn('syncing')
  })
}