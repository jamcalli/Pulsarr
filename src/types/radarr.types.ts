export interface RadarrAddOptions {
  searchForMovie: boolean
}

export interface RadarrMovie {
  title: string
  imdbId?: string
  tmdbId?: number
  id: number
  isAvailable?: boolean
  added?: string
  hasFile?: boolean
}

export interface RadarrPost {
  title: string
  tmdbId: number
  qualityProfileId: number | null | string
  rootFolderPath: string | null
  addOptions: RadarrAddOptions
  tags: string[]
}

export interface RadarrConfiguration {
  radarrApiKey: string
  radarrBaseUrl: string
  radarrQualityProfileId: number | null | string
  radarrRootFolder: string | null
  radarrTagIds: string[]
}

export interface RootFolder {
  path: string
  accessible: boolean
  freeSpace: number
  unmappedFolders: unknown[]
  id: number
}

export interface QualityProfile {
  name: string
  upgradeAllowed: boolean
  cutoff: number
  items: unknown[]
  id: number
}

export interface PagedResult<T> {
  page: number
  pageSize: number
  sortKey: string
  sortDirection: string
  totalRecords: number
  records: T[]
}

export interface RadarrExclusion {
  id: number
  tmdbId: number
  movieTitle: string
  movieYear: number
}

export interface Item {
  title: string
  guids: string[]
  type: 'movie'
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  movie_status?: 'available' | 'unavailable'
  genres?: string[]
}

export interface RadarrInstance {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  qualityProfile?: string | null | undefined
  rootFolder?: string | null | undefined
  bypassIgnored: boolean
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
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

export interface ConnectionTestResult {
  success: boolean
  message: string
}

export interface PingResponse {
  status: string
}