import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds a `newUserDefaultCanSync` boolean column to the `configs` table with a default value of `true`.
 *
 * @param knex - The Knex instance for schema modification.
 */
export async function up(knex: Knex): Promise<void> {
    if (shouldSkipForPostgreSQL(knex, '031_20250530_add_new_user_defaults')) {
    return
  }
await knex.schema.alterTable('configs', (table) => {
    table.boolean('newUserDefaultCanSync').defaultTo(true)
  })
}

/**
 * Drops the `newUserDefaultCanSync` column from the `configs` table, reverting the schema change introduced by the migration.
 */
export async function down(knex: Knex): Promise<void> {
    if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('newUserDefaultCanSync')
  })
}