import type { Knex } from 'knex'

/**
 * Adds the `deletionMode` column to the `configs` table to support tag-based deletion workflows.
 *
 * Checks for the existence of the `configs` table and, if present, adds a new string column `deletionMode` with a default value of `'watchlist'`. This column determines the deletion workflow mode, supporting values such as `'watchlist'` and `'tag-based'`.
 *
 * @remark The default value `'watchlist'` ensures backward compatibility. The `'tag-based'` mode leverages the existing `removedTagPrefix` configuration for identifying content to delete.
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
 * Removes the `deletionMode` column from the `configs` table if it exists, reverting the migration.
 *
 * @remark
 * The function checks for the existence of the `configs` table before attempting to drop the column to prevent errors if the table is missing.
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