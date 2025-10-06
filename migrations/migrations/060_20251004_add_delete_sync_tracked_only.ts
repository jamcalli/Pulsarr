import type { Knex } from 'knex'

/**
 * Adds delete sync configuration for tracked-only deletion and approval cleanup.
 *
 * Introduces two new boolean columns to the `configs` table:
 * - `deleteSyncTrackedOnly`: When enabled, delete sync only deletes content that exists in the approval_requests table (content tracked by Pulsarr)
 * - `deleteSyncCleanupApprovals`: When enabled, delete sync removes approval_requests records for deleted content
 *
 * Both settings work with watchlist-based and tag-based deletion modes and default to false for backward compatibility.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.boolean('deleteSyncTrackedOnly').defaultTo(false)
    table.boolean('deleteSyncCleanupApprovals').defaultTo(false)
  })
}

/**
 * Removes the tracked-only deletion and approval cleanup configuration columns.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configs', (table) => {
    table.dropColumn('deleteSyncTrackedOnly')
    table.dropColumn('deleteSyncCleanupApprovals')
  })
}
