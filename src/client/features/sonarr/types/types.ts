import type { RootFolder, QualityProfile } from '@root/types/sonarr.types'

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
  | 'pilot_rolling'
  | 'first_season_rolling'
  | 'recent'
  | 'monitorSpecials'
  | 'unmonitorSpecials'
  | 'none'
  | 'skip'

// Centralized set of rolling monitoring options
export const ROLLING_MONITORING_OPTIONS = new Set<string>([
  'pilot_rolling',
  'first_season_rolling',
])

// Type guard to check if a monitoring option is a rolling option
export function isRollingMonitoringOption(option: string): boolean {
  return ROLLING_MONITORING_OPTIONS.has(option)
}

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
