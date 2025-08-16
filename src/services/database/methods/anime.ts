import type { AnimeIdRow, InsertAnimeId } from '@root/types/anime.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { Knex } from 'knex'

/**
 * Determines whether a given external ID and source pair exists in the anime IDs table.
 *
 * @param externalId - The external identifier to check
 * @param source - The source associated with the external ID
 * @returns True if the external ID and source exist in the anime IDs table; otherwise, false
 */
export async function isAnime(
  this: DatabaseService,
  externalId: string,
  source: string,
): Promise<boolean> {
  const result = await this.knex('anime_ids')
    .where({ external_id: externalId, source })
    .first()

  return !!result
}

/**
 * Determines if any of the specified external ID and source pairs exist in the anime IDs table.
 *
 * Returns `false` if the input array is empty.
 *
 * @param ids - Array of objects each containing an external ID and its source to check for existence
 * @returns `true` if at least one pair exists in the table, otherwise `false`
 */
export async function isAnyAnime(
  this: DatabaseService,
  ids: Array<{ externalId: string; source: string }>,
): Promise<boolean> {
  if (ids.length === 0) return false

  const result = await this.knex('anime_ids')
    .where(function () {
      for (const { externalId, source } of ids) {
        this.orWhere({ external_id: externalId, source })
      }
    })
    .first()
  return !!result
}

/**
 * Inserts multiple anime ID records into the `anime_ids` table, skipping duplicates based on external ID and source.
 *
 * Performs bulk insertion in database-appropriate chunk sizes to avoid query limitations. Uses the provided transaction if available; otherwise, creates a new transaction internally. No operation is performed if the input array is empty.
 *
 * @param animeIds - List of anime ID records to insert
 */
export async function insertAnimeIds(
  this: DatabaseService,
  animeIds: InsertAnimeId[],
  trx?: Knex.Transaction,
): Promise<void> {
  if (animeIds.length === 0) return

  const executeInsert = async (transaction: Knex.Transaction) => {
    // SQLite has a limit on compound SELECT terms when using onConflict
    // Reduce chunk size for SQLite to avoid "too many terms in compound SELECT" error
    const client = this.knex.client.config.client
    const chunkSize = client === 'better-sqlite3' ? 100 : 1000

    for (const chunk of this.chunkArray(animeIds, chunkSize)) {
      await transaction('anime_ids')
        .insert(chunk)
        .onConflict(['external_id', 'source'])
        .ignore()
    }
  }

  if (trx) {
    await executeInsert(trx)
  } else {
    // Use transaction with chunked inserts for better performance
    await this.knex.transaction(executeInsert)
  }
}

/**
 * Deletes all records from the `anime_ids` table.
 *
 * This operation removes every anime ID entry, effectively resetting the table.
 */
export async function clearAllAnimeIds(this: DatabaseService): Promise<void> {
  await this.knex('anime_ids').del()
}

/**
 * Returns the total number of records in the `anime_ids` table.
 *
 * @returns The count of anime ID records as a number
 */
export async function getAnimeCount(this: DatabaseService): Promise<number> {
  const result = await this.knex('anime_ids').count('* as count').first()
  return Number(result?.count || 0)
}

/**
 * Returns the number of anime ID records for a specific source.
 *
 * @param source - The source to filter anime IDs by
 * @returns The count of anime IDs associated with the given source
 */
export async function getAnimeCountBySource(
  this: DatabaseService,
  source: string,
): Promise<number> {
  const result = await this.knex('anime_ids')
    .where({ source })
    .count('* as count')
    .first()
  return Number(result?.count || 0)
}

/**
 * Retrieves all anime ID records from the database filtered by the specified source.
 *
 * @param source - The source to filter anime IDs by
 * @returns An array of anime ID records matching the given source
 */
export async function getAnimeIdsBySource(
  this: DatabaseService,
  source: string,
): Promise<AnimeIdRow[]> {
  return this.knex('anime_ids').where({ source }).select('*')
}

/**
 * Retrieves the most recent `updated_at` timestamp from the `anime_ids` table.
 *
 * @returns The latest update timestamp as a `Date` object, or `null` if no records exist.
 */
export async function getLastUpdated(
  this: DatabaseService,
): Promise<Date | null> {
  const result = await this.knex('anime_ids')
    .max('updated_at as lastUpdated')
    .first()

  return result?.lastUpdated ? new Date(result.lastUpdated) : null
}
