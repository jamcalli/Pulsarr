import type { Knex } from 'knex'

/**
 * Adds support for user tagging in Sonarr and Radarr.
 * 
 * This migration adds configuration options for user tagging:
 * - `useAliasForTags` - Use user aliases instead of names for tag labels
 * - `tagUsersInSonarr` - Enable user tagging in Sonarr
 * - `tagUsersInRadarr` - Enable user tagging in Radarr
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    // Use aliases instead of usernames for tags
    table.boolean('useAliasForTags').defaultTo(true)
    
    // Control which services get user tags
    table.boolean('tagUsersInSonarr').defaultTo(false)
    table.boolean('tagUsersInRadarr').defaultTo(false)
  })

  // Set default values for existing configs row
  await knex('configs')
    .whereNull('useAliasForTags')
    .update({ useAliasForTags: true })
    
  await knex('configs')
    .whereNull('tagUsersInSonarr')
    .update({ tagUsersInSonarr: false })
    
  await knex('configs')
    .whereNull('tagUsersInRadarr')
    .update({ tagUsersInRadarr: false })
}

/**
 * Removes user tagging configuration options.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('useAliasForTags')
    table.dropColumn('tagUsersInSonarr')
    table.dropColumn('tagUsersInRadarr')
  })
}