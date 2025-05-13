import type { Knex } from 'knex'

/**
 * Adds configuration options for special tags when content is removed from watchlists.
 * 
 * 1. Introduces two new configuration options:
 *   - `removedTagMode`: Enum string ('remove', 'keep', 'special-tag') to control behavior of user tags when content is unwatchlisted
 *   - `removedTagPrefix`: String to customize the prefix for the special "removed" tag
 * 
 * 2. Migrates the existing persistHistoricalTags setting:
 *   - If persistHistoricalTags=true, sets removedTagMode='keep'
 */
export async function up(knex: Knex): Promise<void> {
  // Check if the table exists before attempting to modify
  const configExists = await knex.schema.hasTable('configs')
  
  if (configExists) {
    // Add the new columns to the schema using the camelCase naming convention 
    // (same as other configs table columns like tagUsersInSonarr)
    await knex.schema.alterTable('configs', (table) => {
      table.string('removedTagMode').defaultTo('remove')
      table.string('removedTagPrefix').defaultTo('pulsarr:removed')
    })
    
    // Get the current config
    const config = await knex('configs').first()
    
    if (config) {
      const updates: Record<string, any> = {}
      
      // Update removedTagMode based on persistHistoricalTags
      if (config.persistHistoricalTags === true) {
        updates.removedTagMode = 'keep'
      } else {
        updates.removedTagMode = 'remove'
      }
      
      // Apply the updates
      if (Object.keys(updates).length > 0) {
        await knex('configs').update(updates)
      }
    }
  }
}

/**
 * Reverts the migration by removing the added configuration options.
 */
export async function down(knex: Knex): Promise<void> {
  // Check if the table exists before attempting to modify
  const configExists = await knex.schema.hasTable('configs')
  
  if (configExists) {
    // Drop the columns added in the up migration
    await knex.schema.alterTable('configs', (table) => {
      table.dropColumn('removedTagMode')
      table.dropColumn('removedTagPrefix')
    })
  }
}