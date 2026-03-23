import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
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
    const duplicateGroups = await knex('rolling_monitored_shows')
      .select('sonarr_series_id', 'sonarr_instance_id', 'plex_user_id')
      .groupBy('sonarr_series_id', 'sonarr_instance_id', 'plex_user_id')
      .havingRaw('COUNT(*) > 1')

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

      if (records.length > 1) {
        idsToDelete.push(...records.slice(1).map((r) => r.id))
      }
    }

    const chunkSize = 50
    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
      const chunk = idsToDelete.slice(i, i + chunkSize)
      if (chunk.length > 0) {
        await knex('rolling_monitored_shows').whereIn('id', chunk).del()
      }
    }
  }

  // Allows multiple records per show (global + per-user) but prevents
  // duplicate user entries for the same show
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.unique(
      ['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'],
      'uq_rmshows_series_instance_user',
    )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolling_monitored_shows', (table) => {
    table.dropUnique(
      ['sonarr_series_id', 'sonarr_instance_id', 'plex_user_id'],
      'uq_rmshows_series_instance_user',
    )
  })
}
