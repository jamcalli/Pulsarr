import type { Knex } from 'knex'

/**
 * Adds configuration options for tag-based deletion mode.
 * 
 * 1. Introduces new configuration option:
 *   - `deletionMode`: Enum string ('watchlist', 'tag-based') to control the deletion workflow mode
 * 
 * 2. Defaults:
 *   - deletionMode defaults to 'watchlist' to maintain backward compatibility
 *   - The tag-based deletion mode will use the existing 'removedTagPrefix' for identifying content to delete
 */
export async function up(knex: Knex): Promise<void> {
  // Check if the table exists before attempting to modify
  const configExists = await knex.schema.hasTable('configs')
  
  if (configExists) {
    // Add the new column to the schema using the camelCase naming convention
    await knex.schema.alterTable('configs', (table) => {
      table.string('deletionMode').defaultTo('watchlist')
    })
  }
}

/**
 * Reverts the migration by removing the added configuration option.
 */
export async function down(knex: Knex): Promise<void> {
  // Check if the table exists before attempting to modify
  const configExists = await knex.schema.hasTable('configs')
  
  if (configExists) {
    // Drop the column added in the up migration
    await knex.schema.alterTable('configs', (table) => {
      table.dropColumn('deletionMode')
    })
  }
}