import type { Knex } from 'knex'

/**
 * Adds Plex playlist protection configuration options to the configs table
 *
 * This migration adds:
 * - enablePlexPlaylistProtection: Toggle to enable/disable the feature
 * - plexProtectionPlaylistName: Custom playlist name for protection
 * - plexServerUrl: URL to the Plex server (optional, as it can be auto-detected)
 *
 * Note: The plexServerUrl is made optional since the system can now automatically
 * detect the proper server URL from the Plex API's resource endpoints. It remains
 * as a configuration option to support custom setups or environments where
 * auto-detection may not work correctly.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('enablePlexPlaylistProtection').defaultTo(false)
    table.string('plexProtectionPlaylistName').defaultTo('Do Not Delete')
    table.string('plexServerUrl').defaultTo('http://localhost:32400')
  })
}

/**
 * Removes the Plex playlist protection configuration options added by this migration
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('enablePlexPlaylistProtection')
    table.dropColumn('plexProtectionPlaylistName')
    table.dropColumn('plexServerUrl')
  })
}