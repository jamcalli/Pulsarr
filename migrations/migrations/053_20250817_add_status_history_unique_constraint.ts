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
  // Use optimized approach for PostgreSQL, fallback for SQLite

  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Use efficient window function DELETE for large datasets
    await knex.raw(`
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY watchlist_item_id, status
                 ORDER BY "timestamp" ASC, id ASC
               ) AS rn
        FROM watchlist_status_history
      )
      DELETE FROM watchlist_status_history h
      USING ranked r
      WHERE h.id = r.id
        AND r.rn > 1
    `)
  } else {
    // SQLite: Use per-group cleanup (safer for SQLite limitations)
    const duplicateGroups = await knex('watchlist_status_history')
      .select('watchlist_item_id', 'status')
      .groupBy('watchlist_item_id', 'status')
      .havingRaw('COUNT(*) > 1')

    for (const group of duplicateGroups) {
      const earliestRecord = await knex('watchlist_status_history')
        .where({
          watchlist_item_id: group.watchlist_item_id,
          status: group.status,
        })
        .orderBy('timestamp', 'asc')
        .orderBy('id', 'asc')
        .first()

      if (earliestRecord) {
        await knex('watchlist_status_history')
          .where({
            watchlist_item_id: group.watchlist_item_id,
            status: group.status,
          })
          .whereNot('id', earliestRecord.id)
          .del()
      }
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
