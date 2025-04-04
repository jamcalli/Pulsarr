/**
 * Content Lookup Types for Router Plugins
 *
 * Type definitions for API responses from Radarr and Sonarr when looking up content metadata.
 * These types are used to properly type the data returned from API calls made by router plugins
 * when they need to fetch additional metadata that isn't available in the ContentItem object.
 */

// Common types used by both Radarr and Sonarr
export interface ContentLanguage {
  id: number
  name: string
}

export interface ContentImage {
  coverType:
    | 'unknown'
    | 'poster'
    | 'banner'
    | 'fanart'
    | 'screenshot'
    | 'headshot'
    | 'clearlogo'
  url: string
  remoteUrl: string
}

//==============================================================================
// Radarr Movie Lookup Response Types
//==============================================================================

export interface RadarrAlternateTitle {
  id: number
  sourceType: string
  movieMetadataId: number
  title: string
  cleanTitle: string
}

export interface RadarrAddOptions {
  ignoreEpisodesWithFiles?: boolean
  ignoreEpisodesWithoutFiles?: boolean
  monitor?: 'movieOnly' | 'movieAndCollection' | 'none'
  searchForMovie: boolean
  addMethod?: 'manual' | 'automatic'
}

export interface RadarrRatingSource {
  votes: number
  value: number
  type: 'user' | 'critic'
}

export interface RadarrRatings {
  imdb?: RadarrRatingSource
  tmdb?: RadarrRatingSource
  metacritic?: RadarrRatingSource
  rottenTomatoes?: RadarrRatingSource
  trakt?: RadarrRatingSource
}

export interface RadarrCollectionInfo {
  title: string
  tmdbId: number
}

export interface RadarrStatistics {
  movieFileCount: number
  sizeOnDisk: number
  releaseGroups: string[]
}

/**
 * Response type for Radarr movie lookup API endpoints
 * Used when making calls to endpoints like `movie/lookup/tmdb`
 */
export interface RadarrMovieLookupResponse {
  id: number
  title: string
  originalTitle?: string
  originalLanguage?: ContentLanguage
  alternateTitles?: RadarrAlternateTitle[]
  secondaryYear?: number
  secondaryYearSourceId?: number
  sortTitle?: string
  sizeOnDisk?: number
  status?: 'tba' | 'announced' | 'inCinemas' | 'released' | 'deleted'
  overview?: string
  inCinemas?: string
  physicalRelease?: string
  digitalRelease?: string
  releaseDate?: string
  physicalReleaseNote?: string
  images?: ContentImage[]
  website?: string
  remotePoster?: string
  year: number // This is the key field we need for year-based routing
  youTubeTrailerId?: string
  studio?: string
  path?: string
  qualityProfileId?: number
  hasFile?: boolean
  movieFileId?: number
  monitored?: boolean
  minimumAvailability?: 'tba' | 'announced' | 'inCinemas' | 'released'
  isAvailable?: boolean
  folderName?: string
  runtime?: number
  cleanTitle?: string
  imdbId?: string
  tmdbId: number
  titleSlug?: string
  rootFolderPath?: string
  folder?: string
  certification?: string
  genres?: string[]
  tags?: number[]
  added?: string
  addOptions?: RadarrAddOptions
  ratings?: RadarrRatings
  collection?: RadarrCollectionInfo
  popularity?: number
  lastSearchTime?: string
  statistics?: RadarrStatistics
}

//==============================================================================
// Sonarr Series Lookup Response Types
//==============================================================================

export interface SonarrAlternateTitle {
  title: string
  seasonNumber?: number
  sceneSeasonNumber?: number
  sceneOrigin?: string
  comment?: string
}

export interface SonarrSeasonStatistics {
  nextAiring?: string
  previousAiring?: string
  episodeFileCount: number
  episodeCount: number
  totalEpisodeCount: number
  sizeOnDisk: number
  releaseGroups: string[]
  percentOfEpisodes: number
}

export interface SonarrSeason {
  seasonNumber: number
  monitored: boolean
  statistics?: SonarrSeasonStatistics
  images?: ContentImage[]
}

export interface SonarrAddOptions {
  ignoreEpisodesWithFiles?: boolean
  ignoreEpisodesWithoutFiles?: boolean
  monitor?:
    | 'all'
    | 'future'
    | 'missing'
    | 'existing'
    | 'pilot'
    | 'firstSeason'
    | 'latestSeason'
    | 'none'
  searchForMissingEpisodes?: boolean
  searchForCutoffUnmetEpisodes?: boolean
}

export interface SonarrRatings {
  votes: number
  value: number
}

export interface SonarrStatistics {
  seasonCount: number
  episodeFileCount: number
  episodeCount: number
  totalEpisodeCount: number
  sizeOnDisk: number
  releaseGroups: string[]
  percentOfEpisodes: number
}

/**
 * Response type for Sonarr series lookup API endpoints
 * Used when making calls to endpoints like `series/lookup`
 */
export interface SonarrSeriesLookupResponse {
  id: number
  title: string
  alternateTitles?: SonarrAlternateTitle[]
  sortTitle?: string
  status?: 'continuing' | 'ended' | 'upcoming' | 'deleted'
  ended?: boolean
  profileName?: string
  overview?: string
  nextAiring?: string
  previousAiring?: string
  network?: string
  airTime?: string
  images?: ContentImage[]
  originalLanguage?: ContentLanguage
  remotePoster?: string
  seasons?: SonarrSeason[]
  year: number // This is the key field we need for year-based routing
  path?: string
  qualityProfileId?: number
  seasonFolder?: boolean
  monitored?: boolean
  monitorNewItems?: 'all' | 'none'
  useSceneNumbering?: boolean
  runtime?: number
  tvdbId: number
  tvRageId?: number
  tvMazeId?: number
  tmdbId?: number
  firstAired?: string
  lastAired?: string
  seriesType?: 'standard' | 'anime' | 'daily'
  cleanTitle?: string
  imdbId?: string
  titleSlug?: string
  rootFolderPath?: string
  folder?: string
  certification?: string
  genres?: string[]
  tags?: number[]
  added?: string
  addOptions?: SonarrAddOptions
  ratings?: SonarrRatings
  statistics?: SonarrStatistics
  episodesChanged?: boolean
}

// Define a type for unknown responses
export type ApiResponse = unknown

// Type guard to check if an API response is from Radarr
export function isRadarrResponse(
  response: ApiResponse,
): response is RadarrMovieLookupResponse {
  return (
    response !== undefined &&
    response !== null &&
    typeof response === 'object' &&
    'tmdbId' in response &&
    !('tvdbId' in response)
  )
}

// Type guard to check if an API response is from Sonarr
export function isSonarrResponse(
  response: ApiResponse,
): response is SonarrSeriesLookupResponse {
  return (
    response !== undefined &&
    response !== null &&
    typeof response === 'object' &&
    'tvdbId' in response
  )
}

// Helper function to extract year from either response type
export function extractYear(
  response:
    | RadarrMovieLookupResponse
    | SonarrSeriesLookupResponse
    | ApiResponse,
): number | undefined {
  if (!response || typeof response !== 'object' || response === null)
    return undefined

  if ('year' in response && typeof response.year === 'number') {
    return response.year
  }

  return undefined
}
