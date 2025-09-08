/**
 * URL for the IMDb ratings TSV file
 * Contains ratings and vote counts for all IMDb titles
 * Using pre-filtered dataset from master branch
 */
export const IMDB_RATINGS_URL =
  'https://raw.githubusercontent.com/jamcalli/pulsarr/master/title.ratings.filtered.tsv.gz'

/**
 * URL for the IMDb basics TSV file
 * Contains basic information for all IMDb titles (used for filtering)
 */
export const IMDB_BASICS_URL = 'https://datasets.imdbws.com/title.basics.tsv.gz'

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
