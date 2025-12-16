import type { Knex } from 'knex'

/**
 * Clears anime_ids table to fix TMDB namespace confusion.
 *
 * Previously, both TMDB movie IDs (tmdbid) and TMDB TV IDs (tmdbtv) from the
 * anime-lists XML were stored with the same source 'tmdb'. Since TMDB uses
 * separate ID namespaces for movies and TV shows, this caused false positives
 * where a movie's TMDB ID could match an anime TV show's TMDB ID.
 *
 * After this migration, the anime plugin will repopulate the table on startup
 * with properly separated sources: 'tmdb_movie' and 'tmdb_tv'.
 */
export async function up(knex: Knex): Promise<void> {
  await knex('anime_ids').truncate()
}

/**
 * No rollback needed - table will repopulate on next app startup.
 */
export async function down(_knex: Knex): Promise<void> {
  // No-op: The anime plugin auto-populates when the table is empty
}
