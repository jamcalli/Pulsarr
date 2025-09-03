import type {
  ImdbRatingLookup,
  InsertImdbRating,
} from '@root/types/imdb.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

/**
 * Looks up IMDB rating data for a given IMDB title ID.
 *
 * @param tconst - The IMDB title ID (e.g., 'tt1234567')
 * @returns IMDB rating data if found, null otherwise
 */
export async function getImdbRating(
  this: DatabaseService,
  tconst: string,
): Promise<ImdbRatingLookup | null> {
  const result = await this.knex('imdb_ratings')
    .where({ tconst })
    .select(
      'tconst',
      'average_rating as averageRating',
      'num_votes as numVotes',
    )
    .first()

  return result || null
}

/**
 * Looks up IMDB rating data for multiple IMDB title IDs.
 *
 * @param tconstList - Array of IMDB title IDs
 * @returns Array of IMDB rating data for found titles
 */
export async function getImdbRatings(
  this: DatabaseService,
  tconstList: string[],
): Promise<ImdbRatingLookup[]> {
  if (tconstList.length === 0) return []

  return this.knex('imdb_ratings')
    .whereIn('tconst', tconstList)
    .select(
      'tconst',
      'average_rating as averageRating',
      'num_votes as numVotes',
    )
}

/**
 * Inserts multiple IMDB rating records into the `imdb_ratings` table, skipping duplicates.
 *
 * Performs bulk insertion in database-appropriate chunk sizes to avoid query limitations.
 * Uses the provided transaction if available; otherwise, creates a new transaction internally.
 * No operation is performed if the input array is empty.
 *
 * @param ratings - List of IMDB rating records to insert
 * @param trx - Optional transaction to use
 */
export async function insertImdbRatings(
  this: DatabaseService,
  ratings: InsertImdbRating[],
  trx?: Knex.Transaction,
): Promise<void> {
  if (ratings.length === 0) return

  const executeInsert = async (transaction: Knex.Transaction) => {
    // SQLite has a limit on compound SELECT terms when using onConflict
    // Reduce chunk size for SQLite to avoid "too many terms in compound SELECT" error
    const chunkSize = this.isPostgres ? 1000 : 100

    for (const chunk of this.chunkArray(ratings, chunkSize)) {
      await transaction('imdb_ratings')
        .insert(chunk)
        .onConflict(['tconst'])
        .ignore()
    }
  }

  if (trx) {
    await executeInsert(trx)
  } else {
    await this.knex.transaction(executeInsert)
  }
}

/**
 * Deletes all records from the `imdb_ratings` table.
 *
 * This operation removes every IMDB rating entry, effectively resetting the table.
 */
export async function clearAllImdbRatings(
  this: DatabaseService,
): Promise<void> {
  await this.knex('imdb_ratings').del()
}

/**
 * Returns the total number of records in the `imdb_ratings` table.
 *
 * @returns The count of IMDB rating records as a number
 */
export async function getImdbRatingCount(
  this: DatabaseService,
): Promise<number> {
  const result = await this.knex('imdb_ratings').count('* as count').first()
  return Number(result?.count || 0)
}

/**
 * Retrieves the most recent `updated_at` timestamp from the `imdb_ratings` table.
 *
 * @returns The latest update timestamp as a `Date` object, or `null` if no records exist.
 */
export async function getImdbLastUpdated(
  this: DatabaseService,
): Promise<Date | null> {
  const result = await this.knex('imdb_ratings')
    .max('updated_at as lastUpdated')
    .first()

  return result?.lastUpdated ? new Date(result.lastUpdated) : null
}

/**
 * Get statistics about ratings in the database
 */
export async function getImdbRatingStats(this: DatabaseService): Promise<{
  totalCount: number
  avgRating: number | null
  avgVotes: number | null
  highRatedCount: number // ratings >= 8.0
  popularCount: number // votes >= 10000
}> {
  const [totalResult, statsResult, highRatedResult, popularResult] =
    await Promise.all([
      this.knex('imdb_ratings').count('* as count').first(),
      this.knex('imdb_ratings')
        .avg('average_rating as avgRating')
        .avg('num_votes as avgVotes')
        .first(),
      this.knex('imdb_ratings')
        .where('average_rating', '>=', 8.0)
        .count('* as count')
        .first(),
      this.knex('imdb_ratings')
        .where('num_votes', '>=', 10000)
        .count('* as count')
        .first(),
    ])

  return {
    totalCount: Number(totalResult?.count || 0),
    avgRating: statsResult?.avgRating ? Number(statsResult.avgRating) : null,
    avgVotes: statsResult?.avgVotes ? Number(statsResult.avgVotes) : null,
    highRatedCount: Number(highRatedResult?.count || 0),
    popularCount: Number(popularResult?.count || 0),
  }
}
