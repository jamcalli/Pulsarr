/**
 * Database row type for anime_ids table
 */
export interface AnimeIdRow {
  id: number
  external_id: string
  source: string
  created_at: Date
  updated_at: Date
}

/**
 * Insert type for anime_ids table
 */
export interface InsertAnimeId {
  external_id: string
  source: string
}

/**
 * Anime lookup methods for DatabaseService
 */
declare module '@services/database.service.js' {
  interface DatabaseService {
    isAnime(externalId: string, source: string): Promise<boolean>
    isAnyAnime(
      ids: Array<{ externalId: string; source: string }>,
    ): Promise<boolean>
    insertAnimeIds(
      animeIds: InsertAnimeId[],
      trx?: import('knex').Knex.Transaction,
    ): Promise<void>
    clearAllAnimeIds(): Promise<void>
    getAnimeCount(): Promise<number>
    getAnimeCountBySource(source: string): Promise<number>
    getAnimeIdsBySource(source: string): Promise<AnimeIdRow[]>
    getLastUpdated(): Promise<Date | null>
  }
}
