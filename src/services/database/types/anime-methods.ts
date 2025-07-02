import type { AnimeIdRow, InsertAnimeId } from '@root/types/anime.types.js'

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
