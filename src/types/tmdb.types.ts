/**
 * Type definitions for TMDB API responses
 *
 * These are internal types used by the TMDB service for API v3 responses
 * that are not exposed in the public schemas.
 */

// TMDB API Error Response
export interface TmdbErrorResponse {
  status_code: number
  status_message: string
  success: false
}

// TMDB Watch Provider
export interface TmdbWatchProvider {
  display_priority: number
  logo_path: string
  provider_id: number
  provider_name: string
}

// TMDB Watch Provider Data
export interface TmdbWatchProviderData {
  link?: string
  flatrate?: TmdbWatchProvider[]
  rent?: TmdbWatchProvider[]
  buy?: TmdbWatchProvider[]
}

// TMDB Watch Providers API Response
export interface TmdbWatchProvidersResponse {
  id: number
  results: Record<string, TmdbWatchProviderData>
}

// TMDB Find API Movie Result
export interface TmdbFindMovieResult {
  adult: boolean
  backdrop_path: string | null
  genre_ids: number[]
  id: number
  original_language: string
  original_title: string
  overview: string
  popularity: number
  poster_path: string | null
  release_date: string
  title: string
  media_type: string
  video: boolean
  vote_average: number
  vote_count: number
  origin_country?: string[]
}

// TMDB Find API TV Result
export interface TmdbFindTvResult {
  adult: boolean
  backdrop_path: string | null
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  media_type: string
  original_language: string
  genre_ids: number[]
  popularity: number
  first_air_date: string
  vote_average: number
  vote_count: number
  origin_country: string[]
}

// TMDB Find API Person Result
export interface TmdbFindPersonResult {
  adult: boolean
  gender: number
  id: number
  known_for_department: string
  name: string
  original_name: string
  popularity: number
  profile_path: string | null
  known_for: Array<TmdbFindMovieResult | TmdbFindTvResult>
}

// TMDB Find API TV Episode Result (actual structure from API)
export interface TmdbFindTvEpisodeResult {
  id: number
  name: string
  overview: string
  media_type: string
  vote_average: number
  vote_count: number
  air_date: string
  episode_number: number
  episode_type: string
  production_code: string
  runtime: number
  season_number: number
  show_id: number
  still_path: string | null
}

// TMDB Find API TV Season Result (structure inferred, rarely populated)
export interface TmdbFindTvSeasonResult {
  id: number
  name: string
  overview: string
  media_type: string
  air_date: string | null
  episode_count?: number
  poster_path: string | null
  season_number: number
  show_id: number
  vote_average?: number
}

// TMDB Find API Response
export interface TmdbFindResponse {
  movie_results: TmdbFindMovieResult[]
  person_results: TmdbFindPersonResult[]
  tv_results: TmdbFindTvResult[]
  tv_episode_results: TmdbFindTvEpisodeResult[]
  tv_season_results: TmdbFindTvSeasonResult[]
}

// TMDB Region
export interface TmdbRegion {
  code: string
  name: string
}

// Type guard for TMDB Error Response
export function isTmdbError(response: object): response is TmdbErrorResponse {
  const obj = response as Record<string, unknown>
  return (
    typeof obj.success === 'boolean' &&
    obj.success === false &&
    typeof obj.status_code === 'number' &&
    typeof obj.status_message === 'string'
  )
}
