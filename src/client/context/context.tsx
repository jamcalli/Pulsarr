import type React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'
import type { RootFolder, QualityProfile } from '@root/types/sonarr.types'

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'

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
  | 'recent'
  | 'monitorSpecials'
  | 'unmonitorSpecials'
  | 'none'
  | 'skip'

export const SONARR_MONITORING_OPTIONS: Record<SonarrMonitoringType, string> = {
  unknown: 'Unknown',
  all: 'All Seasons',
  future: 'Future Seasons',
  missing: 'Missing Episodes',
  existing: 'Existing Episodes',
  firstSeason: 'First Season',
  lastSeason: 'Last Season',
  latestSeason: 'Latest Season',
  pilot: 'Pilot Only',
  recent: 'Recent Episodes',
  monitorSpecials: 'Monitor Specials',
  unmonitorSpecials: 'Unmonitor Specials',
  none: 'None',
  skip: 'Skip',
}

export interface Config {
  port: number
  dbPath: string
  cookieSecret: string
  cookieName: string
  cookieSecured: boolean
  logLevel: LogLevel
  closeGraceDelay: number
  rateLimitMax: number
  syncIntervalSeconds: number
  plexTokens: string[]
  skipFriendSync: boolean
  deleteMovie: boolean
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteIntervalDays: number
  deleteFiles: boolean
  selfRss?: string
  friendsRss?: string
  _isReady: boolean
}

interface ConfigResponse {
  success: boolean
  config: Config
}

interface SonarrInstanceData {
  rootFolders: RootFolder[]
  qualityProfiles: QualityProfile[]
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
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  data?: SonarrInstanceData
}

interface InstancesResponse {
  success: boolean
  instances: SonarrInstance[]
}

interface ConfigContextType {
  config: Config | null
  loading: boolean
  error: string | null
  instances: SonarrInstance[]
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchInstances: () => Promise<void>
  fetchInstanceData: (instanceId: string) => Promise<void>
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [instances, setInstances] = useState<SonarrInstance[]>([])

  useEffect(() => {
    const initialize = async () => {
      try {
        await Promise.all([
          fetchConfig(),
          fetchInstances()
        ])
      } catch (err) {
        console.error('Initialization error:', err)
      } finally {
        setLoading(false)
      }
    }
    initialize()
  }, [])

  const fetchConfig = async () => {
    try {
      const response = await fetch('/v1/config/config')
      const data: ConfigResponse = await response.json()
      if (data.success) {
        setConfig(data.config)
      } else {
        throw new Error('Failed to fetch config')
      }
    } catch (err) {
      setError('Failed to load configuration')
      console.error('Config fetch error:', err)
    }
  }

  const updateConfig = async (updates: Partial<Config>) => {
    try {
      setLoading(true)
      const response = await fetch('/v1/config/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data: ConfigResponse = await response.json()
      if (data.success) {
        setConfig(data.config)
      } else {
        throw new Error('Failed to update config')
      }
    } catch (err) {
      setError('Failed to update configuration')
      console.error('Config update error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const fetchInstances = async () => {
    try {
      const response = await fetch('/v1/sonarr/all-instances')
      const data: InstancesResponse = await response.json()
      if (data.success) {
        setInstances(data.instances)
      } else {
        throw new Error('Failed to fetch instances')
      }
    } catch (err) {
      setError('Failed to fetch Sonarr instances')
      console.error('Instances fetch error:', err)
      throw err
    }
  }

  const fetchInstanceData = async (instanceId: string) => {
    try {
      setLoading(true);
      
      const targetInstance = instances.find(i => i.id === Number(instanceId));
      if (!targetInstance) {
        throw new Error('Instance not found');
      }

      if (targetInstance.data?.rootFolders && targetInstance.data?.qualityProfiles) {
        return;
      }

      const [foldersResponse, profilesResponse] = await Promise.all([
        fetch(`/v1/sonarr/root-folders?instanceId=${instanceId}`),
        fetch(`/v1/sonarr/quality-profiles?instanceId=${instanceId}`)
      ]);

      const [foldersData, profilesData] = await Promise.all([
        foldersResponse.json(),
        profilesResponse.json()
      ]);

      if (!foldersData.success || !profilesData.success) {
        throw new Error('Failed to fetch instance data');
      }

      setInstances(prev => prev.map(instance => 
        instance.id === Number(instanceId)
          ? {
              ...instance,
              data: {
                rootFolders: foldersData.rootFolders,
                qualityProfiles: profilesData.qualityProfiles
              }
            }
          : instance
      ));
    } catch (err) {
      setError('Failed to fetch Sonarr instance data');
      console.error('Sonarr data fetch error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigContext.Provider
      value={{
        config,
        loading,
        error,
        instances,
        updateConfig,
        fetchInstances,
        fetchInstanceData,
      }}
    >
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const context = useContext(ConfigContext)
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider')
  }
  return context
}