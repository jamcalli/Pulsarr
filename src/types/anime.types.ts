/**
 * URL for the anime list XML file from anime-lists repository
 * Contains comprehensive anime database with external IDs (TVDB, TMDB, IMDb)
 */
export const ANIME_LIST_URL =
  'https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list-full.xml'

/**
 * Supported external ID sources for anime detection
 */
export const ANIME_SOURCES = ['tvdb', 'tmdb_movie', 'tmdb_tv', 'imdb'] as const

export type AnimeSource = (typeof ANIME_SOURCES)[number]

/**
 * Insert type for anime_ids table
 */
export interface InsertAnimeId {
  external_id: string
  source: string
}
