import type { QualityProfile, RootFolder } from '@root/types/sonarr.types'

export type SonarrMonitoringType =
  | 'unknown'
  | 'all'
  | 'future'
  | 'missing'
  | 'existing'
  | 'firstSeason'
  | 'lastSeason'
  | 'latestSeason'
  | 'pilot'
  | 'pilotRolling'
  | 'firstSeasonRolling'
  | 'recent'
  | 'monitorSpecials'
  | 'unmonitorSpecials'
  | 'none'
  | 'skip'

export interface SonarrInstanceData {
  rootFolders?: RootFolder[]
  qualityProfiles?: QualityProfile[]
  fetching?: boolean
}

export interface SonarrInstance {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  qualityProfile?: string
  rootFolder?: string
  bypassIgnored: boolean
  seasonMonitoring: string
  monitorNewItems?: 'all' | 'none'
  searchOnAdd: boolean
  createSeasonFolders?: boolean
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  seriesType?: 'standard' | 'anime' | 'daily'
  data?: SonarrInstanceData
}

export interface UseSonarrInstanceFormProps {
  instance: SonarrInstance
  instances: SonarrInstance[]
  isNew?: boolean
  isConnectionValid: boolean
}

export interface SonarrConnectionValues {
  baseUrl: string
  apiKey: string
  name: string
  qualityProfile?: string
  rootFolder?: string
}

export interface SonarrInstanceFormValues extends SonarrConnectionValues {
  bypassIgnored: boolean
  seasonMonitoring: SonarrMonitoringType
  monitorNewItems: 'all' | 'none'
  searchOnAdd: boolean
  createSeasonFolders?: boolean
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  seriesType?: 'standard' | 'anime' | 'daily'
  _connectionTested?: boolean
  _originalBaseUrl?: string
  _originalApiKey?: string
}

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error'

export interface GenreRoute {
  id?: number
  name: string
  genre: string
  sonarrInstanceId: number
  rootFolder: string
  qualityProfile: string
}

export interface TempRoute {
  tempId: string
  name: string
  genre: string
  sonarrInstanceId: number
  rootFolder: string
  qualityProfile: string
}
