/**
 * URL for the anime list XML file from anime-lists repository
 * Contains comprehensive anime database with external IDs (TVDB, TMDB, IMDb)
 */
export const ANIME_LIST_URL =
  'https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list-full.xml'

/**
 * Supported external ID sources for anime detection
 */
export const ANIME_SOURCES = ['tvdb', 'tmdb', 'imdb'] as const

export type AnimeSource = (typeof ANIME_SOURCES)[number]

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
