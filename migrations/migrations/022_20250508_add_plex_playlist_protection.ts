import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds Plex playlist protection configuration columns to the configs table.
 *
 * Alters the configs table by adding three columns: enablePlexPlaylistProtection (boolean, default false), plexProtectionPlaylistName (string, default "Do Not Delete"), and plexServerUrl (string, default "http://localhost:32400").
 *
 * @remark The plexServerUrl column is optional, as the system can auto-detect the Plex server URL, but this setting allows manual configuration for custom environments.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '022_20250508_add_plex_playlist_protection')) {
    return
  }
await knex.schema.alterTable('configs', (table) => {
    table.boolean('enablePlexPlaylistProtection').defaultTo(false)
    table.string('plexProtectionPlaylistName').defaultTo('Do Not Delete')
    table.string('plexServerUrl').defaultTo('http://localhost:32400')
  })
}

/**
 * Reverts the schema changes by removing Plex playlist protection configuration columns from the `configs` table.
 *
 * Drops the `enablePlexPlaylistProtection`, `plexProtectionPlaylistName`, and `plexServerUrl` columns.
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
