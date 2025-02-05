import type React from 'react'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react'
import type { RootFolder, QualityProfile } from '@root/types/sonarr.types'
import type { Config } from '@root/types/config.types'

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
  skip: 'Skip',
}

interface ConfigResponse {
  success: boolean
  config: Config
}

interface SonarrInstanceData {
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
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  data?: SonarrInstanceData
}

interface GenresResponse {
  success: boolean
  genres: string[]
}

interface GenreRoute {
  id: number
  name: string
  sonarrInstanceId: number
  genre: string
  rootFolder: string
}

interface ConfigContextType {
  config: Config | null
  loading: boolean
  error: string | null
  instances: SonarrInstance[]
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchInstances: () => Promise<void>
  fetchInstanceData: (instanceId: string) => Promise<void>
  genres: string[]
  fetchGenres: () => Promise<void>
  genreRoutes: GenreRoute[]
  fetchGenreRoutes: () => Promise<void>
  createGenreRoute: (route: Omit<GenreRoute, 'id'>) => Promise<GenreRoute>
  updateGenreRoute: (
    id: number,
    updates: Partial<Omit<GenreRoute, 'id'>>,
  ) => Promise<void>
  deleteGenreRoute: (id: number) => Promise<void>
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [instances, setInstances] = useState<SonarrInstance[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [genreRoutes, setGenreRoutes] = useState<GenreRoute[]>([])

  useEffect(() => {
    const initialize = async () => {
      try {
        await Promise.all([fetchConfig(), fetchInstances()])
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
      const response = await fetch('/v1/sonarr/instances')
      const instances: SonarrInstance[] = await response.json()
      setInstances(instances)
    } catch (err) {
      setError('Failed to fetch Sonarr instances')
      console.error('Instances fetch error:', err)
      throw err
    }
  }

  const fetchInstanceData = async (instanceId: string) => {
    try {
      setLoading(true)
      const targetInstance = instances.find((i) => i.id === Number(instanceId))
      if (!targetInstance) {
        throw new Error('Instance not found')
      }
  
      // If we already have the data or are currently fetching, return
      if (
        (targetInstance.data?.rootFolders && targetInstance.data?.qualityProfiles) ||
        targetInstance.data?.fetching
      ) {
        return
      }
  
      // Mark instance as fetching
      setInstances((prev) =>
        prev.map((instance) =>
          instance.id === Number(instanceId)
            ? {
                ...instance,
                data: { ...instance.data, fetching: true },
              }
            : instance,
        ),
      )
  
      const [foldersResponse, profilesResponse] = await Promise.all([
        fetch(`/v1/sonarr/root-folders?instanceId=${instanceId}`),
        fetch(`/v1/sonarr/quality-profiles?instanceId=${instanceId}`),
      ])
  
      const [foldersData, profilesData] = await Promise.all([
        foldersResponse.json(),
        profilesResponse.json(),
      ])
  
      if (!foldersData.success || !profilesData.success) {
        throw new Error('Failed to fetch instance data')
      }
  
      setInstances((prev) =>
        prev.map((instance) =>
          instance.id === Number(instanceId)
            ? {
                ...instance,
                data: {
                  rootFolders: foldersData.rootFolders,
                  qualityProfiles: profilesData.qualityProfiles,
                  fetching: false,
                },
              }
            : instance,
        ),
      )
    } catch (err) {
      // Reset fetching state on error
      setInstances((prev) =>
        prev.map((instance) =>
          instance.id === Number(instanceId)
            ? {
                ...instance,
                data: { ...instance.data, fetching: false },
              }
            : instance,
        ),
      )
      setError('Failed to fetch Sonarr instance data')
      console.error('Sonarr data fetch error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const fetchGenres = async () => {
    try {
      const response = await fetch('/v1/plex/genres')
      const data: GenresResponse = await response.json()
      if (data.success) {
        setGenres(data.genres)
      } else {
        throw new Error('Failed to fetch genres')
      }
    } catch (err) {
      console.error('Genres fetch error:', err)
      throw err
    }
  }

  const fetchGenreRoutes = useCallback(async () => {
    try {
      const response = await fetch('/v1/sonarr/genre-routes')
      if (!response.ok) {
        throw new Error('Failed to fetch genre routes')
      }
      const routes = await response.json()
      setGenreRoutes(Array.isArray(routes) ? routes : [])
    } catch (error) {
      console.error('Error fetching genre routes:', error)
      setGenreRoutes([])
      throw error
    }
  }, [])

  const createGenreRoute = async (
    route: Omit<GenreRoute, 'id'>,
  ): Promise<GenreRoute> => {
    const response = await fetch('/v1/sonarr/genre-routes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(route),
    })

    if (!response.ok) {
      throw new Error('Failed to create genre route')
    }

    const createdRoute = await response.json()

    setGenreRoutes((currentRoutes) => [...currentRoutes, createdRoute])

    return createdRoute
  }

  const updateGenreRoute = async (
    id: number,
    updates: Partial<Omit<GenreRoute, 'id'>>,
  ) => {
    const response = await fetch(`/v1/sonarr/genre-routes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      throw new Error('Failed to update genre route')
    }

    await fetchGenreRoutes()
  }

  const deleteGenreRoute = async (id: number) => {
    const response = await fetch(`/v1/sonarr/genre-routes/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete genre route')
    }

    await fetchGenreRoutes()
  }

  const value = {
    config,
    loading,
    error,
    instances,
    genres,
    updateConfig,
    fetchInstances,
    fetchInstanceData,
    fetchGenres,
    genreRoutes,
    fetchGenreRoutes,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
  }

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  )
}
export function useConfig() {
  const context = useContext(ConfigContext)
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider')
  }
  return context
}
