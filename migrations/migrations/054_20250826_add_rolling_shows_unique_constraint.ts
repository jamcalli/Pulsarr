import type { Knex } from 'knex'

/**
 * Adds a unique constraint to rolling_monitored_shows to prevent duplicate per-user entries.
 * Ensures race-safe creation of per-user rolling monitoring records.
 */
export async function up(knex: Knex): Promise<void> {
  // This migration should run on both SQLite and PostgreSQL
  // No skip logic needed since this is after the consolidated migration 034

  // Step 1: Clean up existing duplicates using database-specific approaches
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
    // PostgreSQL: Use efficient window function DELETE for large datasets
    await knex.raw(`
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY sonarr_series_id, sonarr_instance_id, plex_user_id
                 ORDER BY created_at ASC, id ASC
               ) AS rn
        FROM rolling_monitored_shows
      )
      DELETE FROM rolling_monitored_shows h
      USING ranked r
      WHERE h.id = r.id
        AND r.rn > 1
    `)
  } else {
    // SQLite: Use per-group cleanup (safer for SQLite limitations)
    const duplicateGroups = await knex('rolling_monitored_shows')
      .select('sonarr_series_id', 'sonarr_instance_id', 'plex_user_id')
      .groupBy('sonarr_series_id', 'sonarr_instance_id', 'plex_user_id')
      .havingRaw('COUNT(*) > 1')

    // Collect all IDs to delete in batches for better performance
    const idsToDelete: number[] = []

    for (const group of duplicateGroups) {
      const records = await knex('rolling_monitored_shows')
        .where({
          sonarr_series_id: group.sonarr_series_id,
          sonarr_instance_id: group.sonarr_instance_id,
          plex_user_id: group.plex_user_id,
        })
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .select('id')

      // Keep the first record, delete the rest
      if (records.length > 1) {
        idsToDelete.push(...records.slice(1).map((r) => r.id))
      }
    }

    // Batch delete in chunks to avoid query size limits
    const chunkSize = 50
    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
      const chunk = idsToDelete.slice(i, i + chunkSize)
      if (chunk.length > 0) {
        await knex('rolling_monitored_shows').whereIn('id', chunk).del()
      }
    }
  }

  // Step 2: Add unique constraint to prevent duplicate per-user entries
  // This allows multiple records per show (global + per-user) but prevents
  // duplicate user entries for the same show
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.unique(
      ['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'],
      'uq_rmshows_series_instance_user',
    )
  })
}

/**
 * Removes the unique constraint from rolling_monitored_shows.
 */
export async function down(knex: Knex): Promise<void> {
  // This migration should run on both SQLite and PostgreSQL
  // No skip logic needed since this is after the consolidated migration 034

  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropUnique(
      ['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'],
      'uq_rmshows_series_instance_user',
    )
  })
}
