import type React from 'react'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react'
import type { RootFolder, QualityProfile } from '@root/types/sonarr.types'
import type { RootFolder as RadarrRootFolder, QualityProfile as RadarrQualityProfile } from '@root/types/radarr.types'
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

interface RadarrInstanceData {
  rootFolders?: RadarrRootFolder[]
  qualityProfiles?: RadarrQualityProfile[]
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

export interface RadarrInstance {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  qualityProfile?: string
  rootFolder?: string
  bypassIgnored: boolean
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  data?: RadarrInstanceData
}

interface GenresResponse {
  success: boolean
  genres: string[]
}

interface SonarrGenreRoute {
  id: number
  name: string
  sonarrInstanceId: number
  genre: string
  rootFolder: string
}

interface RadarrGenreRoute {
  id: number
  name: string
  radarrInstanceId: number
  genre: string
  rootFolder: string
}

interface ConfigContextType {
  config: Config | null
  loading: boolean
  error: string | null
  sonarrInstances: SonarrInstance[]
  radarrInstances: RadarrInstance[]
  isInitialized: boolean
  instancesLoading: boolean
  setInstancesLoading: (loading: boolean) => void
  updateConfig: (updates: Partial<Config>) => Promise<void>
  fetchSonarrInstances: () => Promise<void>
  fetchRadarrInstances: () => Promise<void>
  fetchSonarrInstanceData: (instanceId: string) => Promise<void>
  fetchRadarrInstanceData: (instanceId: string) => Promise<void>
  fetchAllSonarrInstanceData: () => Promise<void>
  fetchAllRadarrInstanceData: () => Promise<void>
  genres: string[]
  fetchGenres: () => Promise<void>
  sonarrGenreRoutes: SonarrGenreRoute[]
  radarrGenreRoutes: RadarrGenreRoute[]
  fetchSonarrGenreRoutes: () => Promise<void>
  fetchRadarrGenreRoutes: () => Promise<void>
  createSonarrGenreRoute: (route: Omit<SonarrGenreRoute, 'id'>) => Promise<SonarrGenreRoute>
  updateSonarrGenreRoute: (id: number, updates: Partial<Omit<SonarrGenreRoute, 'id'>>) => Promise<void>
  deleteSonarrGenreRoute: (id: number) => Promise<void>
  createRadarrGenreRoute: (route: Omit<RadarrGenreRoute, 'id'>) => Promise<RadarrGenreRoute>
  updateRadarrGenreRoute: (id: number, updates: Partial<Omit<RadarrGenreRoute, 'id'>>) => Promise<void>
  deleteRadarrGenreRoute: (id: number) => Promise<void>
  initialize: (force?: boolean) => Promise<void>
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [instancesLoading, setInstancesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sonarrInstances, setSonarrInstances] = useState<SonarrInstance[]>([])
  const [radarrInstances, setRadarrInstances] = useState<RadarrInstance[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [sonarrGenreRoutes, setSonarrGenreRoutes] = useState<SonarrGenreRoute[]>([])
  const [radarrGenreRoutes, setRadarrGenreRoutes] = useState<RadarrGenreRoute[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isLoadingRef = useRef(false)
  const isInitialMount = useRef(true)

  const setLoadingWithMinDuration = useCallback((loading: boolean) => {
    if (loading && !isInitialMount.current && !isLoadingRef.current) {
      return
    }

    if (loading) {
      if (!isLoadingRef.current) {
        isLoadingRef.current = true
        setInstancesLoading(true)
      }
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }

      loadingTimeoutRef.current = setTimeout(() => {
        setInstancesLoading(false)
        isLoadingRef.current = false
        loadingTimeoutRef.current = null
        if (isInitialMount.current) {
          isInitialMount.current = false
        }
      }, 250)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  const fetchConfig = useCallback(async () => {
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
  }, [])

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

  const fetchSonarrInstances = useCallback(async () => {
    try {
      const currentInstances = [...sonarrInstances]
      const response = await fetch('/v1/sonarr/instances')
      const newInstances: SonarrInstance[] = await response.json()

      const mergedInstances = newInstances.map((newInst) => {
        const existingInstance = currentInstances.find(
          (curr) => curr.id === newInst.id,
        )
        if (existingInstance) {
          return {
            ...newInst,
            data: existingInstance.data,
          }
        }
        return newInst
      })

      setSonarrInstances(mergedInstances)
    } catch (err) {
      setError('Failed to fetch Sonarr instances')
      console.error('Instances fetch error:', err)
      throw err
    }
  }, [sonarrInstances])

  const fetchRadarrInstances = useCallback(async () => {
    try {
      const currentInstances = [...radarrInstances]
      const response = await fetch('/v1/radarr/instances')
      const newInstances: RadarrInstance[] = await response.json()

      const mergedInstances = newInstances.map((newInst) => {
        const existingInstance = currentInstances.find(
          (curr) => curr.id === newInst.id,
        )
        if (existingInstance) {
          return {
            ...newInst,
            data: existingInstance.data,
          }
        }
        return newInst
      })

      setRadarrInstances(mergedInstances)
    } catch (err) {
      setError('Failed to fetch Radarr instances')
      console.error('Instances fetch error:', err)
      throw err
    }
  }, [radarrInstances])

  const fetchSonarrInstanceData = async (instanceId: string) => {
    const existingInstance = sonarrInstances.find(
      (inst) => inst.id === Number(instanceId),
    )
    if (
      existingInstance?.data?.rootFolders &&
      existingInstance?.data?.qualityProfiles
    ) {
      return
    }

    setLoadingWithMinDuration(true)
    try {
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

      setSonarrInstances((currentInstances) =>
        currentInstances.map((instance) => {
          if (instance.id === Number(instanceId)) {
            return {
              ...instance,
              data: {
                rootFolders: foldersData.rootFolders,
                qualityProfiles: profilesData.qualityProfiles,
              },
            }
          }
          return instance
        }),
      )
    } catch (error) {
      console.error('Failed to fetch instance data:', error)
      throw error
    } finally {
      setLoadingWithMinDuration(false)
    }
  }

  const fetchRadarrInstanceData = async (instanceId: string) => {
    const existingInstance = radarrInstances.find(
      (inst) => inst.id === Number(instanceId),
    )
    if (
      existingInstance?.data?.rootFolders &&
      existingInstance?.data?.qualityProfiles
    ) {
      return
    }

    setLoadingWithMinDuration(true)
    try {
      const [foldersResponse, profilesResponse] = await Promise.all([
        fetch(`/v1/radarr/root-folders?instanceId=${instanceId}`),
        fetch(`/v1/radarr/quality-profiles?instanceId=${instanceId}`),
      ])

      const [foldersData, profilesData] = await Promise.all([
        foldersResponse.json(),
        profilesResponse.json(),
      ])

      if (!foldersData.success || !profilesData.success) {
        throw new Error('Failed to fetch instance data')
      }

      setRadarrInstances((currentInstances) =>
        currentInstances.map((instance) => {
          if (instance.id === Number(instanceId)) {
            return {
              ...instance,
              data: {
                rootFolders: foldersData.rootFolders,
                qualityProfiles: profilesData.qualityProfiles,
              },
            }
          }
          return instance
        }),
      )
    } catch (error) {
      console.error('Failed to fetch instance data:', error)
      throw error
    } finally {
      setLoadingWithMinDuration(false)
    }
  }

  const fetchAllSonarrInstanceData = async () => {
    setLoadingWithMinDuration(true)
    try {
      await fetchSonarrInstances()
      const validInstances = sonarrInstances.filter(
        (inst) => inst.apiKey && inst.apiKey !== 'placeholder',
      )
      await Promise.all(
        validInstances.map((instance) =>
          fetchSonarrInstanceData(instance.id.toString()),
        ),
      )
    } catch (err) {
      setError('Failed to fetch all Sonarr instance data')
      console.error('Failed to fetch all instance data:', err)
      throw err
    } finally {
      setLoadingWithMinDuration(false)
    }
  }

  const fetchAllRadarrInstanceData = async () => {
    setLoadingWithMinDuration(true)
    try {
      await fetchRadarrInstances()
      const validInstances = radarrInstances.filter(
        (inst) => inst.apiKey && inst.apiKey !== 'placeholder',
      )
      await Promise.all(
        validInstances.map((instance) =>
          fetchRadarrInstanceData(instance.id.toString()),
        ),
      )
    } catch (err) {
      setError('Failed to fetch all Radarr instance data')
      console.error('Failed to fetch all instance data:', err)
      throw err
    } finally {
      setLoadingWithMinDuration(false)
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

  const fetchSonarrGenreRoutes = useCallback(async () => {
    try {
      const response = await fetch('/v1/sonarr/genre-routes')
      if (!response.ok) {
        throw new Error('Failed to fetch Sonarr genre routes')
      }
      const routes = await response.json()
      setSonarrGenreRoutes(Array.isArray(routes) ? routes : [])
    } catch (error) {
      console.error('Error fetching Sonarr genre routes:', error)
      setSonarrGenreRoutes([])
      throw error
    }
  }, [])

  const fetchRadarrGenreRoutes = useCallback(async () => {
    try {
      const response = await fetch('/v1/radarr/genre-routes')
      if (!response.ok) {
        throw new Error('Failed to fetch Radarr genre routes')
      }
      const routes = await response.json()
      setRadarrGenreRoutes(Array.isArray(routes) ? routes : [])
    } catch (error) {
      console.error('Error fetching Radarr genre routes:', error)
      setRadarrGenreRoutes([])
      throw error
    }
  }, [])

  const createSonarrGenreRoute = async (
    route: Omit<SonarrGenreRoute, 'id'>,
  ): Promise<SonarrGenreRoute> => {
    const response = await fetch('/v1/sonarr/genre-routes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(route),
    })

    if (!response.ok) {
      throw new Error('Failed to create Sonarr genre route')
    }

    const createdRoute = await response.json()
    setSonarrGenreRoutes((currentRoutes) => [...currentRoutes, createdRoute])
    return createdRoute
  }

  const createRadarrGenreRoute = async (
    route: Omit<RadarrGenreRoute, 'id'>,
  ): Promise<RadarrGenreRoute> => {
    const response = await fetch('/v1/radarr/genre-routes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(route),
    })

    if (!response.ok) {
      throw new Error('Failed to create Radarr genre route')
    }

    const createdRoute = await response.json()
    setRadarrGenreRoutes((currentRoutes) => [...currentRoutes, createdRoute])
    return createdRoute
  }

  const updateSonarrGenreRoute = async (
    id: number,
    updates: Partial<Omit<SonarrGenreRoute, 'id'>>,
  ) => {
    const response = await fetch(`/v1/sonarr/genre-routes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      throw new Error('Failed to update Sonarr genre route')
    }

    await fetchSonarrGenreRoutes()
  }

  const updateRadarrGenreRoute = async (
    id: number,
    updates: Partial<Omit<RadarrGenreRoute, 'id'>>,
  ) => {
    const response = await fetch(`/v1/radarr/genre-routes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    })

    if (!response.ok) {
      throw new Error('Failed to update Radarr genre route')
    }

    await fetchRadarrGenreRoutes()
  }

  const deleteSonarrGenreRoute = async (id: number) => {
    const response = await fetch(`/v1/sonarr/genre-routes/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete Sonarr genre route')
    }

    await fetchSonarrGenreRoutes()
  }

  const deleteRadarrGenreRoute = async (id: number) => {
    const response = await fetch(`/v1/radarr/genre-routes/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete Radarr genre route')
    }

    await fetchRadarrGenreRoutes()
  }

  const initialize = useCallback(
    async (force = false) => {
      if (!isInitialized || force) {
        if (isInitialMount.current) {
          setLoadingWithMinDuration(true)
        }

        try {
          await Promise.all([
            fetchConfig(),
            fetchSonarrInstances(),
            fetchRadarrInstances(),
            fetchSonarrGenreRoutes(),
            fetchRadarrGenreRoutes(),
          ])
          setIsInitialized(true)
        } catch (err) {
          console.error('Initialization error:', err)
          setError('Failed to initialize application')
        } finally {
          if (isInitialMount.current) {
            setLoadingWithMinDuration(false)
          }
        }
      }
    },
    [
      fetchConfig,
      fetchSonarrInstances,
      fetchRadarrInstances,
      fetchSonarrGenreRoutes,
      fetchRadarrGenreRoutes,
      isInitialized,
      setLoadingWithMinDuration,
    ],
  )

  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [initialize, isInitialized])

  const value = {
    config,
    loading,
    error,
    sonarrInstances,
    radarrInstances,
    genres,
    instancesLoading,
    updateConfig,
    fetchSonarrInstances,
    fetchRadarrInstances,
    fetchSonarrInstanceData,
    fetchRadarrInstanceData,
    fetchAllSonarrInstanceData,
    fetchAllRadarrInstanceData,
    fetchGenres,
    sonarrGenreRoutes,
    radarrGenreRoutes,
    initialize,
    fetchSonarrGenreRoutes,
    fetchRadarrGenreRoutes,
    createSonarrGenreRoute,
    createRadarrGenreRoute,
    updateSonarrGenreRoute,
    updateRadarrGenreRoute,
    deleteSonarrGenreRoute,
    deleteRadarrGenreRoute,
    isInitialized,
    setInstancesLoading,
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