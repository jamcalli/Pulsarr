import type { ContentItem } from './router.types.js'

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

export interface Item extends ContentItem {
  type: 'movie'
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  movie_status?: 'available' | 'unavailable'
  genres?: string[]
  radarr_instance_id?: number
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

export interface WebhookNotification {
  id: number
  name: string
  fields: {
    order: number
    name: string
    label: string
    value?: string | number | boolean | null | undefined
    type: string
    advanced: boolean
    privacy?: string
    helpText?: string
    isFloat?: boolean
    selectOptions?: {
      value: number
      name: string
      order: number
      dividerAfter: boolean
    }[]
  }[]
  implementationName: string
  implementation: string
  configContract: string
  infoLink: string
  tags: number[]
  onGrab: boolean
  onDownload: boolean
  onUpgrade: boolean
  onRename: boolean
  onMovieAdded: boolean
  onMovieDelete: boolean
  onMovieFileDelete: boolean
  onMovieFileDeleteForUpgrade: boolean
  onHealthIssue: boolean
  includeHealthWarnings: boolean
  onHealthRestored: boolean
  onApplicationUpdate: boolean
  onManualInteractionRequired: boolean
  supportsOnGrab: boolean
  supportsOnDownload: boolean
  supportsOnUpgrade: boolean
  supportsOnRename: boolean
  supportsOnMovieAdded: boolean
  supportsOnMovieDelete: boolean
  supportsOnMovieFileDelete: boolean
  supportsOnMovieFileDeleteForUpgrade: boolean
  supportsOnHealthIssue: boolean
  supportsOnHealthRestored: boolean
  supportsOnApplicationUpdate: boolean
  supportsOnManualInteractionRequired: boolean
}

export interface ConnectionTestResult {
  success: boolean
  message: string
}

export interface PingResponse {
  status: string
}
