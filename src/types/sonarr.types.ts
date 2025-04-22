export interface SonarrAddOptions {
  monitor: string
  searchForCutoffUnmetEpisodes: boolean
  searchForMissingEpisodes: boolean
}

interface QualityItem {
  id: number
  name: string
  quality: {
    id: number
    name: string
    source: string
    resolution: number
  }
  items: string[]
  allowed: boolean
}

interface FormatItem {
  id: number
  format: number
  name: string
  score: number
}

export interface QualityProfile {
  id: number
  name: string
  upgradeAllowed: boolean
  cutoff: number
  items: QualityItem[]
  minFormatScore: number
  cutoffFormatScore: number
  minUpgradeFormatScore: number
  formatItems: FormatItem[]
}

export interface RootFolder {
  path: string
  accessible: boolean
  freeSpace: number
  totalSpace: number
  id: number
}

export interface PagedResult<T> {
  page: number
  pageSize: number
  sortKey: string
  sortDirection: 'default' | 'ascending' | 'descending'
  totalRecords: number
  records: T[]
}

export interface SonarrPost {
  title: string
  tvdbId: number
  qualityProfileId?: string | number | null
  rootFolderPath?: string
  addOptions: SonarrAddOptions
  languageProfileId?: number | null
  monitored: boolean
  monitorNewItems: 'all' | 'none'
  tags: string[]
}

export interface SonarrSeries {
  title: string
  imdbId?: string
  tvdbId?: number
  id: number
  ended?: boolean
  added?: string
  seasons?: Array<{
    seasonNumber: number
    monitored: boolean
    statistics?: {
      episodeFileCount?: number
      episodeCount?: number
      totalEpisodeCount?: number
      sizeOnDisk?: number
      releaseGroups?: string[]
      percentOfEpisodes?: number
    }
  }>
}

export interface WebhookNotification {
  id: number
  name: string
  implementation: string
  implementationName: string
  onGrab: boolean
  onDownload: boolean
  onUpgrade: boolean
  onSeriesAdd: boolean
  onSeriesDelete: boolean
  fields: Array<{
    name: string
    value: string | number | boolean | undefined | null
  }>
}

export interface Item {
  title: string
  guids: string[]
  type: string
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended'
  genres?: string[]
  sonarr_instance_id?: number
}

export interface SonarrConfiguration {
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfileId: string | number | null
  sonarrLanguageProfileId: number
  sonarrRootFolder: string | null
  sonarrTagIds: string[]
  sonarrSeasonMonitoring: string
  sonarrMonitorNewItems?: 'all' | 'none'
}

export interface SonarrInstance {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  qualityProfile?: string | number | null
  rootFolder?: string | null | undefined
  bypassIgnored: boolean
  seasonMonitoring: string
  monitorNewItems: 'all' | 'none'
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  data?: {
    qualityProfiles?: Array<{ id: number; name: string }>
    rootFolders?: Array<{ path: string }>
  }
}

export interface SonarrGenreRoute {
  id: number
  sonarrInstanceId: number
  name: string
  genre: string
  rootFolder: string
  qualityProfile: string | number | null
}

export interface SonarrItem {
  title: string
  guids: string[]
  type: string
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended'
  genres?: string[]
  sonarr_instance_id?: number
}

export interface PingResponse {
  status: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
}

export interface SonarrEpisodeSchema {
  episodeNumber: number
  seasonNumber: number
  title: string
  overview?: string
  airDateUtc: string // Format: "2025-02-06T08:00:00Z"
}

export interface MediaNotification {
  type: 'movie' | 'show'
  title: string
  username: string
  posterUrl?: string
  episodeDetails?: {
    title?: string
    overview?: string
    seasonNumber?: number
    episodeNumber?: number
    airDateUtc?: string
  }
}

export interface NotificationResult {
  user: {
    apprise: string | null
    discord_id: string | null
    notify_apprise: boolean
    notify_discord: boolean
    name: string
    id: number
    alias: string | null
    can_sync: boolean
  }
  notification: MediaNotification
}
