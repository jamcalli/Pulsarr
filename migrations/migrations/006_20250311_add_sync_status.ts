import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '006_20250311_add_sync_status')) {
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
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('watchlist_radarr_instances', (table) => {
    table.dropColumn('syncing')
  })

  await knex.schema.alterTable('watchlist_sonarr_instances', (table) => {
    table.dropColumn('syncing')
  })
}
