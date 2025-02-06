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
  isInitialized: boolean
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchInstances: () => Promise<void>
  fetchInstanceData: (instanceId: string) => Promise<void>
  fetchAllInstanceData: () => Promise<void> 
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
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    const initialize = async () => {
      if (isInitialized) return
      
      setLoading(true)
      try {
        await fetchConfig()
        await fetchInstances()
        await fetchGenreRoutes()
        setIsInitialized(true)
      } catch (err) {
        console.error('Initialization error:', err)
        setError('Failed to initialize application')
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
      // Store current instances and their data
      const currentInstances = [...instances]
      
      const response = await fetch('/v1/sonarr/instances')
      const newInstances: SonarrInstance[] = await response.json()
      
      // Merge new instances with existing data
      const mergedInstances = newInstances.map(newInst => {
        const existingInstance = currentInstances.find(curr => curr.id === newInst.id)
        if (existingInstance) {
          // Preserve existing instance data
          return {
            ...newInst,
            data: existingInstance.data
          }
        }
        return newInst
      })
      
      setInstances(mergedInstances)
    } catch (err) {
      setError('Failed to fetch Sonarr instances')
      console.error('Instances fetch error:', err)
      throw err
    }
  }

  const fetchInstanceData = async (instanceId: string) => {
    // If we already have the data for this instance, don't fetch again
    const existingInstance = instances.find(inst => inst.id === Number(instanceId))
    if (existingInstance?.data?.rootFolders && existingInstance?.data?.qualityProfiles) {
      return
    }
  
    try {
      const [foldersResponse, profilesResponse] = await Promise.all([
        fetch(`/v1/sonarr/root-folders?instanceId=${instanceId}`),
        fetch(`/v1/sonarr/quality-profiles?instanceId=${instanceId}`)
      ])
  
      const [foldersData, profilesData] = await Promise.all([
        foldersResponse.json(),
        profilesResponse.json()
      ])
  
      if (!foldersData.success || !profilesData.success) {
        throw new Error('Failed to fetch instance data')
      }
  
      setInstances(currentInstances => 
        currentInstances.map(instance => {
          if (instance.id === Number(instanceId)) {
            return {
              ...instance,
              data: {
                rootFolders: foldersData.rootFolders,
                qualityProfiles: profilesData.qualityProfiles
              }
            }
          }
          return instance
        })
      )
    } catch (error) {
      console.error('Failed to fetch instance data:', error)
      throw error
    }
  }
  
  // Modify your fetchAllInstanceData to be more robust
  const fetchAllInstanceData = async () => {
    try {
      // Get fresh instances first
      await fetchInstances()
      
      const validInstances = instances.filter(
        (inst) => inst.apiKey && inst.apiKey !== 'placeholder'
      )
  
      // Fetch all instance data in parallel while preserving existing data
      await Promise.all(
        validInstances.map((instance) => fetchInstanceData(instance.id.toString()))
      )
    } catch (err) {
      setError('Failed to fetch all Sonarr instance data')
      console.error('Failed to fetch all instance data:', err)
      throw err
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
    fetchAllInstanceData,
    fetchGenres,
    genreRoutes,
    fetchGenreRoutes,
    createGenreRoute,
    updateGenreRoute,
    deleteGenreRoute,
    isInitialized
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
