import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

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
