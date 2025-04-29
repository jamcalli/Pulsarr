import type { Knex } from 'knex'

/**
 * Adds `tagUsersInSonarr` and `tagUsersInRadarr` boolean columns to the `configs` table to support user tagging configuration for Sonarr and Radarr.
 *
 * Both columns are added with a default value of `false`, and any existing rows with `NULL` values for these columns are updated to `false`.
 */
export async function up(knex: Knex): Promise<void> {
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
 * Drops the user tagging configuration columns from the `configs` table.
 *
 * Removes the `tagUsersInSonarr` and `tagUsersInRadarr` columns to reverse the migration.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('tagUsersInSonarr')
    table.dropColumn('tagUsersInRadarr')
  })
}