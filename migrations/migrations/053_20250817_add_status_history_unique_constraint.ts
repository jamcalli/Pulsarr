import type { Knex } from 'knex'

/**
 * Remove duplicate status-history rows (keeping the earliest per item/status) and add a unique constraint on (watchlist_item_id, status).
 *
 * Performs a destructive cleanup of duplicate rows in the watchlist_status_history table, using a set-based DELETE via a window function on PostgreSQL and a per-group removal on SQLite, then creates the unique constraint named `uq_watchlist_status_history_item_status`.
 *
 * Note: This migration mutates data (deletes rows) and alters the schema.
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
