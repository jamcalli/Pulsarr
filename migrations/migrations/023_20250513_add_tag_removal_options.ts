import type { Knex } from 'knex'

/**
 * Adds `removedTagMode` and `removedTagPrefix` configuration options to the `configs` table.
 *
 * If the `configs` table exists, this migration adds two new columns:
 * - `removedTagMode`: Controls how user tags are handled when content is removed from watchlists.
 * - `removedTagPrefix`: Customizes the prefix for a special "removed" tag.
 *
 * If a config row exists, sets `removedTagMode` to `'keep'` if `persistHistoricalTags` is `true`, otherwise to `'remove'`.
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
 * Removes the `removedTagMode` and `removedTagPrefix` columns from the `configs` table if they exist.
 *
 * Reverses the changes made by the corresponding migration's `up` function.
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