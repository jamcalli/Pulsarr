import type { Knex } from 'knex'
import type { DatabaseService } from '@services/database.service.js'
import type { AnimeIdRow, InsertAnimeId } from '@root/types/anime.types.js'

/**
 * Check if an external ID is anime
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
 * Check if any of the provided IDs are anime
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
 * Bulk insert anime IDs
 */
export async function insertAnimeIds(
  this: DatabaseService,
  animeIds: InsertAnimeId[],
  trx?: Knex.Transaction,
): Promise<void> {
  if (animeIds.length === 0) return

  const executeInsert = async (transaction: Knex.Transaction) => {
    const chunkSize = 1000
    for (let i = 0; i < animeIds.length; i += chunkSize) {
      const chunk = animeIds.slice(i, i + chunkSize)
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
 * Clear all anime IDs (for rebuilding the table)
 */
export async function clearAllAnimeIds(this: DatabaseService): Promise<void> {
  await this.knex('anime_ids').del()
}

/**
 * Get count of anime IDs
 */
export async function getAnimeCount(this: DatabaseService): Promise<number> {
  const result = await this.knex('anime_ids').count('* as count').first()
  return Number(result?.count || 0)
}

/**
 * Get count of anime IDs by source
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
 * Get anime IDs by source
 */
export async function getAnimeIdsBySource(
  this: DatabaseService,
  source: string,
): Promise<AnimeIdRow[]> {
  return this.knex('anime_ids').where({ source }).select('*')
}

/**
 * Get last updated timestamp
 */
export async function getLastUpdated(
  this: DatabaseService,
): Promise<Date | null> {
  const result = await this.knex('anime_ids')
    .max('updated_at as lastUpdated')
    .first()

  return result?.lastUpdated ? new Date(result.lastUpdated) : null
}
