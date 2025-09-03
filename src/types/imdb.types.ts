/**
 * URL for the IMDb ratings TSV file
 * Contains ratings and vote counts for all IMDb titles
 */
export const IMDB_RATINGS_URL =
  'https://datasets.imdbws.com/title.ratings.tsv.gz'

/**
 * Type-safe IMDb title constant (e.g., "tt1234567")
 */
export type Tconst = `tt${string}`

/**
 * Database row type for imdb_ratings table
 */
export interface ImdbRatingRow {
  id: number
  tconst: Tconst
  average_rating: number | null
  num_votes: number | null
  created_at: Date
  updated_at: Date
}

/**
 * Insert type for imdb_ratings table
 */
export interface InsertImdbRating {
  tconst: Tconst
  average_rating: number | null
  num_votes: number | null
}

/**
 * IMDB rating lookup result
 */
export interface ImdbRatingLookup {
  tconst: Tconst
  averageRating: number | null
  numVotes: number | null
}
