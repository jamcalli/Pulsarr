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
  PILOT_ROLLING = 'pilotRolling', // Monitor pilot only, expand as watched
  FIRST_SEASON_ROLLING = 'firstSeasonRolling', // Monitor S1 only, expand as watched
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
  seasonFolder?: boolean
}

export interface SonarrEpisode {
  id: number
  seriesId: number
  episodeFileId: number
  seasonNumber: number
  episodeNumber: number
  title: string
  airDate?: string
  airDateUtc?: string
  overview?: string
  hasFile: boolean
  monitored: boolean
  unverifiedSceneNumbering: boolean
  grabbed: boolean
}

export interface SonarrSeries {
  title: string
  alternateTitles?: Array<{
    title: string
    sceneSeasonNumber?: number
  }>
  sortTitle?: string
  status?: string
  ended?: boolean
  overview?: string
  network?: string
  airTime?: string
  images?: Array<{
    coverType: string
    url: string
    remoteUrl?: string
  }>
  originalLanguage?: {
    id: number
    name: string
  }
  seasons?: Array<{
    seasonNumber: number
    monitored: boolean
    statistics?: {
      previousAiring?: string
      episodeFileCount?: number
      episodeCount?: number
      totalEpisodeCount?: number
      sizeOnDisk?: number
      releaseGroups?: string[]
      percentOfEpisodes?: number
    }
  }>
  year?: number
  path?: string
  qualityProfileId?: number
  seasonFolder?: boolean
  monitored?: boolean
  monitorNewItems?: 'all' | 'none'
  useSceneNumbering?: boolean
  runtime?: number
  tvdbId?: number
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
  genres?: string[]
  tags?: number[]
  added?: string
  ratings?: {
    votes: number
    value: number
  }
  statistics?: {
    seasonCount?: number
    episodeFileCount?: number
    episodeCount?: number
    totalEpisodeCount?: number
    sizeOnDisk?: number
    releaseGroups?: string[]
    percentOfEpisodes?: number
  }
  languageProfileId?: number
  id: number
  episodeFiles?: Array<{
    seriesId: number
    seasonNumber: number
    relativePath: string
    path: string
    size: number
    dateAdded: string
    sceneName?: string
    releaseGroup?: string
    languages?: Array<{
      id: number
      name: string
    }>
    quality?: {
      quality: {
        id: number
        name: string
        source: string
        resolution: number
      }
      revision: {
        version: number
        real: number
        isRepack: boolean
      }
    }
    customFormats?: Array<{
      id: number
      name: string
    }>
    customFormatScore?: number
    indexerFlags?: number
    releaseType?: string
    mediaInfo?: {
      audioBitrate?: number
      audioChannels?: number | string
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
    qualityCutoffNotMet?: boolean
    id: number
  }>
  previousAiring?: string
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

import type { ContentItem } from '@root/types/router.types.js'

export interface Item extends ContentItem {
  type: 'show'
  ended?: boolean
  added?: string
  status?: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended'
  genres?: string[]
  sonarr_instance_id?: number
  tags?: number[]
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
  createSeasonFolders?: boolean
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
  createSeasonFolders?: boolean
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
