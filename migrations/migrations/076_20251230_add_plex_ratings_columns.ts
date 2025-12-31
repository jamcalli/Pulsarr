import type { Knex } from 'knex'

/**
 * Adds rating columns to watchlist_items table.
 *
 * Plex provides ratings from multiple sources during metadata enrichment:
 * - IMDb: rating (0-10) and vote count
 * - Rotten Tomatoes: critic score (0-10) and audience score (0-10)
 * - TMDB: rating (0-10)
 *
 * These columns store the ratings captured during enrichment, replacing
 * the need for the separate IMDB service that downloads ~100MB daily.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_items', (table) => {
    // IMDb rating (0-10 scale)
    table.decimal('imdb_rating', 3, 1).nullable()
    // IMDb vote count
    table.integer('imdb_votes').nullable()
    // Rotten Tomatoes critic score (0-10 scale)
    table.decimal('rt_critic_rating', 3, 1).nullable()
    // Rotten Tomatoes audience score (0-10 scale)
    table.decimal('rt_audience_rating', 3, 1).nullable()
    // TMDB rating (0-10 scale)
    table.decimal('tmdb_rating', 3, 1).nullable()
  })
}

/**
 * Removes rating columns from watchlist_items table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('watchlist_items', (table) => {
    table.dropColumn('imdb_rating')
    table.dropColumn('imdb_votes')
    table.dropColumn('rt_critic_rating')
    table.dropColumn('rt_audience_rating')
    table.dropColumn('tmdb_rating')
  })
}
