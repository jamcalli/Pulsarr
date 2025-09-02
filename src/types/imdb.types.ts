/**
 * URL for the IMDB ratings TSV file
 * Contains ratings and vote counts for all IMDB titles
 */
export const IMDB_RATINGS_URL =
  'https://datasets.imdbws.com/title.ratings.tsv.gz'

/**
 * Database row type for imdb_ratings table
 */
export interface ImdbRatingRow {
  id: number
  tconst: string
  average_rating: number | null
  num_votes: number | null
  created_at: Date
  updated_at: Date
}

/**
 * Insert type for imdb_ratings table
 */
export interface InsertImdbRating {
  tconst: string
  average_rating: number | null
  num_votes: number | null
}

/**
 * IMDB rating lookup result
 */
export interface ImdbRatingLookup {
  tconst: string
  averageRating: number | null
  numVotes: number | null
}
