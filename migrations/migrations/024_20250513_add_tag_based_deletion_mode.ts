import type { Knex } from 'knex'

/**
 * Adds the `deletionMode` column to the `configs` table to enable multiple deletion workflow modes.
 *
 * Checks if the `configs` table exists and, if so, adds a string column `deletionMode` with a default value of `'watchlist'`. This column allows selection between `'watchlist'` and `'tag-based'` deletion workflows.
 *
 * @remark The default value `'watchlist'` maintains backward compatibility. The `'tag-based'` mode uses the existing `removedTagPrefix` configuration for content deletion.
 */
export async function up(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    console.log('Skipping migration 024_20250513_add_tag_based_deletion_mode - PostgreSQL uses consolidated schema in migration 034')
    return
  }
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
 * Drops the `deletionMode` column from the `configs` table if the table exists, undoing the migration.
 *
 * @remark
 * Checks for the existence of the `configs` table before attempting to drop the column to avoid errors if the table is missing.
 */
export async function down(knex: Knex): Promise<void> {
    // Skip on PostgreSQL - consolidated in migration 034
  const client = knex.client.config.client
  if (client === 'pg') {
    return
  }
  // Check if the table exists before attempting to modify
  const configExists = await knex.schema.hasTable('configs')
  
  if (configExists) {
    // Drop the column added in the up migration
    await knex.schema.alterTable('configs', (table) => {
      table.dropColumn('deletionMode')
    })
  }
}