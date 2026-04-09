import type { Knex } from 'knex'

/**
 * Stores the Sonarr internal series ID so we can query which shows Pulsarr
 * has already added without hitting the Sonarr API. Nullable because existing
 * rows will be backfilled incrementally by the status sync.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_sonarr_instances', (table) => {
    table.integer('sonarr_series_id').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_sonarr_instances', (table) => {
    table.dropColumn('sonarr_series_id')
  })
}
