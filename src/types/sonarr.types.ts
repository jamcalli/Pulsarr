import type { SonarrSeriesType } from '@root/schemas/sonarr/series-type.schema.js'
export interface SonarrAddOptions {
  monitor: string | null
  searchForCutoffUnmetEpisodes: boolean | null
  searchForMissingEpisodes: boolean | null
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
  seriesType?: SonarrSeriesType
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

export interface SonarrTagDetail {
  id: number
  label: string
  seriesIds: number[]
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
  seriesType?: SonarrSeriesType
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
  addOptions?: SonarrAddOptions | null
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
  isExclusion?: boolean
}

// Alias for better semantics - we can gradually migrate to this
export type SonarrItem = Item

export interface SonarrConfiguration {
  sonarrQualityProfileId: string | number | null
  sonarrRootFolder: string | null
  sonarrTagIds: string[]
  sonarrSeasonMonitoring: string
  sonarrMonitorNewItems?: 'all' | 'none'
  searchOnAdd?: boolean
  sonarrSeriesType?: SonarrSeriesType
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
  seriesType?: SonarrSeriesType
  createSeasonFolders?: boolean
  skipDefaultRoutingWhenNoMatch?: boolean
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

export type { ConnectionTestResult } from '@root/types/arr-connection.types.js'

export interface SonarrEpisodeSchema {
  episodeNumber: number
  seasonNumber: number
  title: string
  overview?: string
  airDateUtc?: string
}
