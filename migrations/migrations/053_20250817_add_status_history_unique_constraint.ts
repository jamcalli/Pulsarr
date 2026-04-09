import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg'

  if (isPostgres) {
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
    const duplicateGroups = await knex('watchlist_status_history')
      .select('watchlist_item_id', 'status')
      .groupBy('watchlist_item_id', 'status')
      .havingRaw('COUNT(*) > 1')

    const idsToDelete: number[] = []

    for (const group of duplicateGroups) {
      const records = await knex('watchlist_status_history')
        .where({
          watchlist_item_id: group.watchlist_item_id,
          status: group.status,
        })
        .orderBy('timestamp', 'asc')
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
        await knex('watchlist_status_history').whereIn('id', chunk).del()
      }
    }
  }

  await knex.schema.alterTable('watchlist_status_history', (table) => {
    table.unique(
      ['watchlist_item_id', 'status'],
      'uq_watchlist_status_history_item_status',
    )
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_status_history', (table) => {
    table.dropUnique(
      ['watchlist_item_id', 'status'],
      'uq_watchlist_status_history_item_status',
    )
  })
}
