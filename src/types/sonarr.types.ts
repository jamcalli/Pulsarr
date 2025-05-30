/**
 * Sonarr monitoring options enum
 * Includes standard Sonarr options plus custom rolling options
 */
export enum SonarrMonitoringOption {
  ALL = 'all',
  FUTURE = 'future',
  MISSING = 'missing',
  EXISTING = 'existing',
  FIRST_SEASON = 'firstSeason',
  LATEST_SEASON = 'latestSeason',
  PILOT = 'pilot',
  // Custom rolling options for progressive monitoring
  PILOT_ROLLING = 'pilot_rolling', // Monitor pilot only, expand as watched
  FIRST_SEASON_ROLLING = 'first_season_rolling', // Monitor S1 only, expand as watched
}

export interface SonarrAddOptions {
  monitor: string | null
  searchForCutoffUnmetEpisodes: boolean | null
  searchForMissingEpisodes: boolean | null
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
  seriesType?: 'standard' | 'anime' | 'daily'
}

export interface SonarrSeries {
  title: string
  imdbId?: string
  tvdbId?: number
  id: number
  ended?: boolean
  added?: string
  monitored?: boolean
  monitorNewItems?: 'all' | 'none'
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

import type { ContentItem } from './router.types.js'

export interface Item extends ContentItem {
  type: 'show'
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended'
  genres?: string[]
  sonarr_instance_id?: number
}

// Alias for better semantics - we can gradually migrate to this
export type SonarrItem = Item

export interface SonarrConfiguration {
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfileId: string | number | null
  sonarrLanguageProfileId: number
  sonarrRootFolder: string | null
  sonarrTagIds: string[]
  sonarrSeasonMonitoring: string
  sonarrMonitorNewItems?: 'all' | 'none'
  searchOnAdd?: boolean
  sonarrSeriesType?: 'standard' | 'anime' | 'daily'
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
  searchOnAdd?: boolean
  seriesType?: 'standard' | 'anime' | 'daily'
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
    notify_tautulli: boolean
    tautulli_notifier_id: number | null
    name: string
    id: number
    alias: string | null
    can_sync: boolean
  }
  notification: MediaNotification
}
