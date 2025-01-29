export type LogLevel =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent'

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
  skip: 'Skip'
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
  // Sonarr Config
  sonarrBaseUrl: string
  sonarrApiKey: string
  sonarrQualityProfile: string
  sonarrRootFolder: string
  sonarrBypassIgnored: boolean
  sonarrSeasonMonitoring: SonarrMonitoringType
  sonarrTags: string[]
  // Radarr Config
  radarrBaseUrl: string
  radarrApiKey: string
  radarrQualityProfile: string
  radarrRootFolder: string
  radarrBypassIgnored: boolean
  radarrTags: string[]
  // Plex Config
  plexTokens: string[]
  skipFriendSync: boolean
  // Delete Config
  deleteMovie: boolean
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteIntervalDays: number
  deleteFiles: boolean
  // RSS Config
  selfRss?: string
  friendsRss?: string
  // Ready state
  _isReady: boolean
}

export type RawConfig = {
  [K in keyof Config]: Config[K] extends string[] ? string : Config[K]
}

interface ConfigResponse {
  success: boolean
  config: Config
}

import React, { createContext, useContext, useEffect, useState } from 'react'
import type { RootFolder, QualityProfile } from '@root/types/sonarr.types'

interface SonarrRootFoldersResponse {
  success: boolean
  rootFolders: RootFolder[]
}

interface SonarrQualityProfilesResponse {
  success: boolean
  qualityProfiles: QualityProfile[]
}

interface ConfigContextType {
  config: Config | null
  loading: boolean
  error: string | null
  rootFolders: RootFolder[]
  qualityProfiles: QualityProfile[]
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchSonarrData: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([])
  const [qualityProfiles, setQualityProfiles] = useState<QualityProfile[]>([])

  useEffect(() => {
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
      } finally {
        setLoading(false)
      }
    }

    fetchConfig()
  }, [])

  const updateConfig = async (updates: Partial<Config>) => {
    try {
      setLoading(true)
      const response = await fetch('/v1/config/updateconfig', {
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

  const fetchSonarrData = async () => {
    try {
      setLoading(true)
      // Fetch root folders
      const foldersResponse = await fetch('/v1/sonarr/root-folders')
      const foldersData: SonarrRootFoldersResponse = await foldersResponse.json()
      
      if (!foldersData.success) {
        throw new Error('Failed to fetch root folders')
      }
      setRootFolders(foldersData.rootFolders)

      // Fetch quality profiles
      const profilesResponse = await fetch('/v1/sonarr/quality-profiles')
      const profilesData: SonarrQualityProfilesResponse = await profilesResponse.json()
      
      if (!profilesData.success) {
        throw new Error('Failed to fetch quality profiles')
      }
      setQualityProfiles(profilesData.qualityProfiles)
    } catch (err) {
      setError('Failed to fetch Sonarr data')
      console.error('Sonarr data fetch error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <ConfigContext.Provider
      value={{
        config,
        loading,
        error,
        rootFolders,
        qualityProfiles,
        updateConfig,
        fetchSonarrData,
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