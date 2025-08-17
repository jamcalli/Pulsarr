import type { Knex } from 'knex'

/**
 * Adds a unique constraint to watchlist_status_history to prevent duplicate status entries.
 *
 * This migration:
 * 1. Cleans up any existing duplicate records (keeps the earliest timestamp)
 * 2. Adds a unique constraint on (watchlist_item_id, status)
 * 3. Uses Knex query builder for database agnostic operations
 */
export async function up(knex: Knex): Promise<void> {
  // Step 1: Clean up existing duplicates
  // Find all duplicate combinations and keep only the earliest record

  // Get all duplicate groups (watchlist_item_id, status combinations that appear multiple times)
  const duplicateGroups = await knex('watchlist_status_history')
    .select('watchlist_item_id', 'status')
    .groupBy('watchlist_item_id', 'status')
    .havingRaw('COUNT(*) > 1')

  // For each duplicate group, delete all but the earliest record
  for (const group of duplicateGroups) {
    // Find the earliest record for this group
    const earliestRecord = await knex('watchlist_status_history')
      .where({
        watchlist_item_id: group.watchlist_item_id,
        status: group.status,
      })
      .orderBy('timestamp', 'asc')
      .orderBy('id', 'asc') // tie-breaker for same timestamp
      .first()

    if (earliestRecord) {
      // Delete all other records for this group
      await knex('watchlist_status_history')
        .where({
          watchlist_item_id: group.watchlist_item_id,
          status: group.status,
        })
        .whereNot('id', earliestRecord.id)
        .del()
    }
  }

  // Step 2: Add the unique constraint
  await knex.schema.alterTable('watchlist_status_history', (table) => {
    table.unique(
      ['watchlist_item_id', 'status'],
      'uq_watchlist_status_history_item_status',
    )
  })
}

/**
 * Removes the unique constraint from watchlist_status_history.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_status_history', (table) => {
    table.dropUnique(
      ['watchlist_item_id', 'status'],
      'uq_watchlist_status_history_item_status',
    )
  })
}
