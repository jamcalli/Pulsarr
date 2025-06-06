import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds user tagging configuration columns for Sonarr and Radarr to the `configs` table.
 *
 * Adds the `tagUsersInSonarr` and `tagUsersInRadarr` boolean columns with a default value of `false`, and updates any existing rows with `NULL` values in these columns to `false`.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '015-20250427_add_user_tagging')) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    // Control which services get user tags
    table.boolean('tagUsersInSonarr').defaultTo(false)
    table.boolean('tagUsersInRadarr').defaultTo(false)
  })

  // Set default values for existing configs row

  await knex('configs')
    .whereNull('tagUsersInSonarr')
    .update({ tagUsersInSonarr: false })
    
  await knex('configs')
    .whereNull('tagUsersInRadarr')
    .update({ tagUsersInRadarr: false })
}

/**
 * Reverts the migration by removing user tagging configuration columns from the `configs` table.
 *
 * Drops the `tagUsersInSonarr` and `tagUsersInRadarr` columns to undo the changes made in the corresponding migration.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagUsersInSonarr')
    table.dropColumn('tagUsersInRadarr')
  })
}