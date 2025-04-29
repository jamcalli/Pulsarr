import type { Knex } from 'knex'

/**
 * Adds new user tagging configuration columns to the `configs` table.
 *
 * This migration introduces `cleanupOrphanedTags`, `persistHistoricalTags`, and `tagPrefix` columns with their respective default values, and updates existing rows where these columns are null.
 */
export async function up(knex: Knex): Promise<void> {
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
 * Reverts the user tagging configuration extension by dropping related columns from the `configs` table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('cleanupOrphanedTags')
    table.dropColumn('persistHistoricalTags')
    table.dropColumn('tagPrefix')
  })
}