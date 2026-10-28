import type { InsertAnimeId } from '@root/types/anime.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { chunkArray } from '@utils/chunk-array.js'
import type { Knex } from 'knex'

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

/** Caller must empty anime_ids in the same transaction first, since inserts skip conflict handling */
export async function bulkReplaceAnimeIds(
  this: DatabaseService,
  animeIds: InsertAnimeId[],
  trx?: Knex.Transaction,
): Promise<void> {
  if (animeIds.length === 0) return

  const executeInsert = async (transaction: Knex.Transaction) => {
    // Postgres caps bind parameters near 65k, and SQLite errors on too many compound SELECT terms
    const chunkSize = this.isPostgres ? 5000 : 100

    for (const chunk of chunkArray(animeIds, chunkSize)) {
      await transaction('anime_ids').insert(chunk)
    }
  }

  if (trx) {
    await executeInsert(trx)
  } else {
    await this.knex.transaction(executeInsert)
  }
}

export async function getAnimeCount(this: DatabaseService): Promise<number> {
  const result = await this.knex('anime_ids').count('* as count').first()
  return Number(result?.count || 0)
}

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

export async function getLastUpdated(
  this: DatabaseService,
): Promise<Date | null> {
  const result = await this.knex('anime_ids')
    .max('updated_at as lastUpdated')
    .first()

  return result?.lastUpdated ? new Date(result.lastUpdated) : null
}
