import type { Knex } from 'knex'

/**
 * These columns store ratings captured during Plex metadata enrichment, replacing
 * the need for the separate IMDB service that downloads ~100MB daily.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_items', (table) => {
    table.decimal('imdb_rating', 3, 1).nullable()
    table.integer('imdb_votes').nullable()
    table.decimal('rt_critic_rating', 3, 1).nullable()
    table.decimal('rt_audience_rating', 3, 1).nullable()
    table.decimal('tmdb_rating', 3, 1).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_items', (table) => {
    table.dropColumn('imdb_rating')
    table.dropColumn('imdb_votes')
    table.dropColumn('rt_critic_rating')
    table.dropColumn('rt_audience_rating')
    table.dropColumn('tmdb_rating')
  })
}
