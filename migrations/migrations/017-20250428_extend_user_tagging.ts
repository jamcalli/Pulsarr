import type { Knex } from 'knex'
import { shouldSkipForPostgreSQL, shouldSkipDownForPostgreSQL } from '../utils/clientDetection.js'

/**
 * Adds user tagging configuration columns to the `configs` table.
 *
 * Introduces the `cleanupOrphanedTags`, `persistHistoricalTags`, and `tagPrefix` columns with default values, and updates existing rows to ensure these columns are not null.
 */
export async function up(knex: Knex): Promise<void> {
  if (shouldSkipForPostgreSQL(knex, '017-20250428_extend_user_tagging')) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    // Add extended tag management configuration columns
    table.boolean('cleanupOrphanedTags').defaultTo(true)
    table.boolean('persistHistoricalTags').defaultTo(false)
    table.string('tagPrefix').defaultTo('pulsarr:user')
  })

  // Set default values for existing configs row
  await knex('configs')
    .whereNull('cleanupOrphanedTags')
    .update({ cleanupOrphanedTags: true })
    
  await knex('configs')
    .whereNull('persistHistoricalTags')
    .update({ persistHistoricalTags: false })
    
  await knex('configs')
    .whereNull('tagPrefix')
    .update({ tagPrefix: 'pulsarr:user' })
}

/**
 * Removes the user tagging configuration columns from the `configs` table.
 *
 * Drops the `cleanupOrphanedTags`, `persistHistoricalTags`, and `tagPrefix` columns to revert the migration.
 */
export async function down(knex: Knex): Promise<void> {
  if (shouldSkipDownForPostgreSQL(knex)) {
    return
  }
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('cleanupOrphanedTags')
    table.dropColumn('persistHistoricalTags')
    table.dropColumn('tagPrefix')
  })
}