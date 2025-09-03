import type {
  ImdbRatingLookup,
  InsertImdbRating,
} from '@root/types/imdb.types.js'
import type { Knex } from 'knex'

declare module '@services/database.service.js' {
  interface DatabaseService {
    /**
     * Looks up IMDB rating data for a given IMDB title ID.
     */
    getImdbRating(tconst: string): Promise<ImdbRatingLookup | null>

    /**
     * Looks up IMDB rating data for multiple IMDB title IDs.
     */
    getImdbRatings(tconstList: string[]): Promise<ImdbRatingLookup[]>

    /**
     * Inserts multiple IMDB rating records into the database.
     */
    insertImdbRatings(
      ratings: InsertImdbRating[],
      trx?: Knex.Transaction,
    ): Promise<void>

    /**
     * Deletes all IMDB rating records from the database.
     */
    clearAllImdbRatings(): Promise<void>

    /**
     * Returns the total number of IMDB rating records.
     */
    getImdbRatingCount(): Promise<number>

    /**
     * Retrieves the most recent update timestamp from the IMDB ratings table.
     */
    getImdbLastUpdated(): Promise<Date | null>

    /**
     * Get statistics about ratings in the database.
     */
    getImdbRatingStats(): Promise<{
      totalCount: number
      avgRating: number | null
      avgVotes: number | null
      highRatedCount: number
      popularCount: number
    }>
  }
}
