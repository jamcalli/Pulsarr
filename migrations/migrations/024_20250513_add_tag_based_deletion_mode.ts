import type { Knex } from 'knex'
import {
  shouldSkipForPostgreSQL,
  shouldSkipDownForPostgreSQL,
} from '../utils/clientDetection.js'

/**
 * Adds a `deletionMode` column to the `configs` table to support multiple deletion workflow modes.
 *
 * If the `configs` table exists and the migration is not skipped for PostgreSQL, this adds a string column `deletionMode` with a default value of `'watchlist'`. The column enables selection between `'watchlist'` and `'tag-based'` deletion workflows.
 *
 * @remark The default `'watchlist'` value preserves existing behavior. The `'tag-based'` mode leverages the `removedTagPrefix` configuration for content deletion.
 */
export async function up(knex: Knex): Promise<void> {
  if (
    shouldSkipForPostgreSQL(knex, '024_20250513_add_tag_based_deletion_mode')
  ) {
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
 * Removes the `deletionMode` column from the `configs` table if it exists, reversing the migration.
 *
 * @remark
 * Skips execution for PostgreSQL databases and checks for the existence of the `configs` table before attempting to drop the column.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
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
