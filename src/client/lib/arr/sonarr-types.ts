import type { SonarrInstanceResponse } from '@root/schemas/sonarr/sonarr-instance.schema'
import type { components } from '@/types/api.js'

export type SonarrMonitoringType =
  components['schemas']['SonarrSeasonMonitoring']

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
