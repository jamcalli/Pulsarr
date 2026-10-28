import type {
  MinimumAvailability,
  RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import type { ContentItem } from '@root/types/router.types.js'

export interface RadarrAddOptions {
  searchForMovie: boolean | null
  monitor?: RadarrMonitorType
}

export interface RadarrTagDetail {
  id: number
  label: string
  movieIds: number[]
}

export interface RadarrMovie {
  title: string
  originalTitle?: string
  imdbId?: string
  tmdbId: number
  id: number
  isAvailable?: boolean
  added?: string
  hasFile?: boolean
  tags?: number[]
  status?: string
  monitored?: boolean
  minimumAvailability?: string
  year?: number
  runtime?: number
  qualityProfileId?: number
  rootFolderPath?: string
  folderName?: string
  path?: string
  cleanTitle?: string
  titleSlug?: string
  certification?: string
  genres?: string[]
  overview?: string
  inCinemas?: string
  releaseDate?: string
  sizeOnDisk?: number
  popularity?: number
  ratings?: {
    imdb?: {
      votes: number
      value: number
      type: string
    }
    tmdb?: {
      votes: number
      value: number
      type: string
    }
    metacritic?: {
      votes: number
      value: number
      type: string
    }
    rottenTomatoes?: {
      votes: number
      value: number
      type: string
    }
    trakt?: {
      votes: number
      value: number
      type: string
    }
  }
  movieFile?: {
    id: number
    movieId: number
    relativePath: string
    path: string
    size: number
    dateAdded: string
    sceneName?: string
    releaseGroup?: string
    quality?: {
      quality: {
        id: number
        name: string
        source: string
        resolution: number
        modifier?: string
      }
      revision: {
        version: number
        real: number
        isRepack: boolean
      }
    }
    mediaInfo?: {
      audioBitrate?: number
      audioChannels?: number
      audioCodec?: string
      audioLanguages?: string
      audioStreamCount?: number
      videoBitDepth?: number
      videoBitrate?: number
      videoCodec?: string
      videoFps?: number
      videoDynamicRange?: string
      videoDynamicRangeType?: string
      resolution?: string
      runTime?: string
      scanType?: string
      subtitles?: string
    }
    languages?: Array<{
      id: number
      name: string
    }>
    qualityCutoffNotMet?: boolean
    originalFilePath?: string
    indexerFlags?: number
  }
  statistics?: {
    movieFileCount?: number
    sizeOnDisk?: number
    releaseGroups?: string[]
  }
  images?: Array<{
    coverType: string
    url: string
    remoteUrl?: string
  }>
  alternateTitles?: Array<{
    sourceType: string
    movieMetadataId: number
    title: string
    id: number
  }>
  originalLanguage?: {
    id: number
    name: string
  }
  keywords?: string[]
  website?: string
  youTubeTrailerId?: string
  studio?: string
  lastSearchTime?: string
}

export interface RadarrPost {
  title: string
  tmdbId: number
  qualityProfileId: number | null | string
  rootFolderPath: string | null
  addOptions: RadarrAddOptions
  tags: string[] // Keep as string[] for compatibility with existing code
  minimumAvailability?: MinimumAvailability
  monitored: boolean
}

export interface RadarrConfiguration {
  radarrQualityProfileId: number | null | string
  radarrRootFolder: string | null
  radarrTagIds: string[]
  searchOnAdd?: boolean
  minimumAvailability?: MinimumAvailability
  monitor?: RadarrMonitorType
}

export interface RadarrExclusion {
  id: number
  tmdbId: number
  movieTitle: string
  movieYear: number
}

export interface Item extends ContentItem {
  type: 'movie'
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  movie_status?: 'available' | 'unavailable'
  genres?: string[]
  radarr_instance_id?: number
  tags?: number[]
  isExclusion?: boolean
}

// Alias for better semantics - we can gradually migrate to this
export type RadarrItem = Item

export interface RadarrInstance {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  qualityProfile?: string | number | null
  rootFolder?: string | null | undefined
  bypassIgnored: boolean
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  searchOnAdd?: boolean
  minimumAvailability?: MinimumAvailability
  monitor?: RadarrMonitorType
  skipDefaultRoutingWhenNoMatch?: boolean
  data?: {
    qualityProfiles?: Array<{ id: number; name: string }>
    rootFolders?: Array<{ path: string }>
  }
}

export interface RadarrGenreRoute {
  id: number
  radarrInstanceId: number
  name: string
  genre: string
  rootFolder: string
  qualityProfile: string | number | null
}

export interface RadarrHealthCheck {
  id: number
  source: string
  type: 'ok' | 'warning' | 'error'
  message: string
  wikiUrl?: {
    fullUri: string
    scheme: string
    host: string
    port: number
    path: string
    query: string
    fragment: string
  }
}

export type { ConnectionTestResult } from '@root/types/arr-connection.types.js'

export interface PingResponse {
  status: string
}
