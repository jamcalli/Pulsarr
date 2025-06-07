import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds Plex playlist protection configuration columns to the configs table.
 *
 * Alters the configs table by adding three columns: enablePlexPlaylistProtection, plexProtectionPlaylistName, and plexServerUrl, each with default values.
 *
 * @remark Skips execution for PostgreSQL databases. The plexServerUrl column is optional and allows manual configuration if automatic detection is not suitable.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '022_20250508_add_plex_playlist_protection')
  ) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('enablePlexPlaylistProtection').defaultTo(false)
    table.string('plexProtectionPlaylistName').defaultTo('Do Not Delete')
    table.string('plexServerUrl').defaultTo('http://localhost:32400')
  })
}

/**
 * Reverts the migration by removing Plex playlist protection columns from the `configs` table.
 *
 * Drops the `enablePlexPlaylistProtection`, `plexProtectionPlaylistName`, and `plexServerUrl` columns if the migration is not skipped for PostgreSQL.
 *
 * @remark No changes are made if the migration is skipped for PostgreSQL databases.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('enablePlexPlaylistProtection')
    table.dropColumn('plexProtectionPlaylistName')
    table.dropColumn('plexServerUrl')
  })
}
