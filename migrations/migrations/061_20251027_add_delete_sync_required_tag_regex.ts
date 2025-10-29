import type { Knex } from 'knex'

/**
 * Adds optional regex filter for tag-based delete sync.
 *
 * Introduces a new text column to the `configs` table:
 * - `deleteSyncRequiredTagRegex`: Optional regex pattern that content tags must match (in addition to having the removal tag) to be deleted
 *
 * This allows coordination between multiple Pulsarr instances - content is only deleted when it has BOTH:
 * 1. The removal tag (e.g., 'pulsarr1:removed')
 * 2. A tag matching the configured regex (e.g., 'pulsarr2:removed')
 *
 * Defaults to NULL (disabled) for backward compatibility.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.text('deleteSyncRequiredTagRegex').nullable()
  })
}

/**
 * Removes the delete sync required tag regex configuration column.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncRequiredTagRegex')
  })
}
