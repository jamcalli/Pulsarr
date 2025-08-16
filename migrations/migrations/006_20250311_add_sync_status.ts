import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds a `syncing` boolean column with a default value of `false` and an index to the `watchlist_radarr_instances` and `watchlist_sonarr_instances` tables.
 *
 * @remark
 * This migration is skipped for PostgreSQL databases.
 */
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

/**
 * Reverts the migration by removing the `syncing` column from the `watchlist_radarr_instances` and `watchlist_sonarr_instances` tables.
 *
 * @remark
 * This operation is skipped for PostgreSQL databases based on client detection logic.
 */
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
