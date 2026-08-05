import type { SonarrInstanceResponse } from '@root/schemas/sonarr/sonarr-instance.schema'

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
  | 'allSeasonPilotRolling'
  | 'recent'
  | 'monitorSpecials'
  | 'unmonitorSpecials'
  | 'none'
  | 'skip'

export interface UseSonarrInstanceFormProps {
  instance: SonarrInstanceResponse
  instances: SonarrInstanceResponse[]
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

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error'
