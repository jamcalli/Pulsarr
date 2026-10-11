import type { RadarrInstanceResponse } from '@root/schemas/radarr/radarr-instance.schema'

export interface UseRadarrInstanceFormProps {
  instance: RadarrInstanceResponse
  instances: RadarrInstanceResponse[]
  isNew?: boolean
  isConnectionValid: boolean
}

export interface RadarrConnectionValues {
  baseUrl: string
  apiKey: string
  name: string
  qualityProfile?: string
  rootFolder?: string
}

export type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error'
