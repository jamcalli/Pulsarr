import type { Knex } from 'knex'

/**
 * Extends user tagging configuration with additional options.
 * 
 * This migration adds configuration options for user tagging:
 * - `cleanupOrphanedTags` - Remove tags for deleted users (default: true)
 * - `persistHistoricalTags` - Keep tags when items are removed from watchlists (default: false)
 * - `tagPrefix` - Prefix for user tags (default: 'pulsarr:user')
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
 * Removes extended user tagging configuration options.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('cleanupOrphanedTags')
    table.dropColumn('persistHistoricalTags')
    table.dropColumn('tagPrefix')
  })
}