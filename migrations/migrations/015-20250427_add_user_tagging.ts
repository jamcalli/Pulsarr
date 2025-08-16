import type { Knex } from 'knex'
import {
  shouldSkipDownForPostgreSQL,
  shouldSkipForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds `tagUsersInSonarr` and `tagUsersInRadarr` boolean columns to the `configs` table for user tagging configuration.
 *
 * The new columns default to `false`, and any existing rows with `NULL` values in these columns are updated to `false`.
 *
 * @remark This migration is skipped for PostgreSQL databases.
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
 * Reverts the migration by dropping the `tagUsersInSonarr` and `tagUsersInRadarr` columns from the `configs` table.
 *
 * @remark
 * This migration is skipped for PostgreSQL databases.
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
