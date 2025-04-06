import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { RootFolder, QualityProfile } from '@root/types/radarr.types'

export interface RadarrGenreRoute {
  id: number
  name: string
  radarrInstanceId: number
  genre: string
  rootFolder: string
  qualityProfile: string
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

export interface RadarrInstanceData {
  rootFolders?: RootFolder[]
  qualityProfiles?: QualityProfile[]
  fetching?: boolean
}

export interface RadarrState {
  // State
  instances: RadarrInstance[]
  genreRoutes: RadarrGenreRoute[]
  genres: string[]
  isInitialized: boolean
  instancesLoading: boolean
  error: string | null
  contentRouterInitialized: boolean

  // Loading management
  isLoadingRef: boolean
  isInitialMount: boolean

  // Actions
  initialize: (force?: boolean) => Promise<void>
  setLoadingWithMinDuration: (loading: boolean) => void

  // Instance operations
  fetchInstances: () => Promise<void>
  fetchInstanceData: (instanceId: string) => Promise<void>
  fetchAllInstanceData: () => Promise<void>
  updateInstance: (
    id: number,
    updates: Partial<RadarrInstance>,
  ) => Promise<void>
  deleteInstance: (id: number) => Promise<void>
  setContentRouterInitialized: (initialized: boolean) => void;

  // Genre operations
  fetchGenres: () => Promise<void>
  fetchGenreRoutes: () => Promise<void>
  createGenreRoute: (
    route: Omit<RadarrGenreRoute, 'id'>,
  ) => Promise<RadarrGenreRoute>
  updateGenreRoute: (
    id: number,
    updates: Partial<Omit<RadarrGenreRoute, 'id'>>,
  ) => Promise<void>
  deleteGenreRoute: (id: number) => Promise<void>
}

export const useRadarrStore = create<RadarrState>()(
  devtools((set, get) => ({
    // Initial state
    instances: [],
    genreRoutes: [],
    genres: [],
    isInitialized: false,
    instancesLoading: false,
    error: null,
    isLoadingRef: false,
    isInitialMount: true,
    contentRouterInitialized: false,

    setLoadingWithMinDuration: (loading) => {
      const state = get()
      if (loading && !state.isInitialMount && !state.isLoadingRef) {
        return
      }

      if (loading) {
        if (!state.isLoadingRef) {
          set({
            isLoadingRef: true,
            instancesLoading: true,
          })
        }
      } else {
        setTimeout(() => {
          set({
            instancesLoading: false,
            isLoadingRef: false,
            isInitialMount: false,
          })
        }, 500)
      }
    },

    setContentRouterInitialized: (initialized) => {
      set({ contentRouterInitialized: initialized })
    },

    fetchInstances: async () => {
      try {
        const currentInstances = get().instances
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
              isDefault: newInst.isDefault,
            }
          }
          return newInst
        })

        set({ instances: mergedInstances })
      } catch (error) {
        set({ error: 'Failed to fetch Radarr instances' })
        throw error
      }
    },

    fetchInstanceData: async (instanceId) => {
      const state = get()
      const existingInstance = state.instances.find(
        (inst) => inst.id === Number(instanceId),
      )

      if (
        existingInstance?.data?.rootFolders &&
        existingInstance?.data?.qualityProfiles
      ) {
        return
      }

      state.setLoadingWithMinDuration(true)
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

        set((state) => ({
          instances: state.instances.map((instance) => {
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
        }))
      } catch (error) {
        console.error('Failed to fetch instance data:', error)
        throw error
      } finally {
        state.setLoadingWithMinDuration(false)
      }
    },

    fetchAllInstanceData: async () => {
      const state = get()
      state.setLoadingWithMinDuration(true)
      try {
        await state.fetchInstances()
        const validInstances = state.instances.filter(
          (inst) => inst.apiKey && inst.apiKey !== 'placeholder',
        )
        await Promise.all(
          validInstances.map((instance) =>
            state.fetchInstanceData(instance.id.toString()),
          ),
        )
      } catch (error) {
        set({ error: 'Failed to fetch all Radarr instance data' })
        throw error
      } finally {
        state.setLoadingWithMinDuration(false)
      }
    },

    fetchGenres: async () => {
      try {
        const response = await fetch('/v1/plex/genres')
        const data: { success: boolean; genres: string[] } =
          await response.json()
        if (data.success) {
          set({ genres: data.genres })
        } else {
          throw new Error('Failed to fetch genres')
        }
      } catch (error) {
        console.error('Failed to fetch genres:', error)
        throw error
      }
    },

    initialize: async (force = false) => {
      const state = get()
      if (!state.isInitialized || force) {
        if (state.isInitialMount) {
          state.setLoadingWithMinDuration(true)
        }

        try {
          await Promise.all([
            state.fetchInstances(),
            state.fetchGenreRoutes(),
            state.fetchGenres(),
          ])
          set({ isInitialized: true })
        } catch (error) {
          set({ error: 'Failed to initialize Radarr' })
          console.error('Initialization error:', error)
        } finally {
          if (state.isInitialMount) {
            state.setLoadingWithMinDuration(false)
          }
        }
      }
    },

    updateInstance: async (id: number, updates: Partial<RadarrInstance>) => {
      const state = get()
      try {
        if (
          updates.isDefault &&
          !state.instances.find((i) => i.id === id)?.isDefault
        ) {
          const updatePromises = state.instances
            .filter((inst) => inst.id !== id && inst.isDefault)
            .map((inst) =>
              fetch(`/v1/radarr/instances/${inst.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...inst,
                  isDefault: false,
                  syncedInstances: [],
                }),
              }),
            )

          await Promise.all(updatePromises)
        }

        const response = await fetch(`/v1/radarr/instances/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...updates,
            name: updates.name?.trim(),
            syncedInstances: updates.syncedInstances || [],
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to update instance')
        }

        await get().fetchInstances()
      } catch (error) {
        console.error('Failed to update instance:', error)
        throw error
      }
    },

    deleteInstance: async (id) => {
      try {
        const response = await fetch(`/v1/radarr/instances/${id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete instance')
        }

        set((state) => ({
          instances: state.instances.filter((inst) => inst.id !== id),
        }))
      } catch (error) {
        console.error('Failed to delete instance:', error)
        throw error
      }
    },

    fetchGenreRoutes: async () => {
      try {
        const response = await fetch('/v1/radarr/genre-routes')
        if (!response.ok) {
          throw new Error('Failed to fetch Radarr genre routes')
        }
        const routes = await response.json()
        set({ genreRoutes: Array.isArray(routes) ? routes : [] })
      } catch (error) {
        console.error('Error fetching Radarr genre routes:', error)
        set({ genreRoutes: [] })
        throw error
      }
    },

    createGenreRoute: async (route) => {
      try {
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
        set((state) => ({
          genreRoutes: [...state.genreRoutes, createdRoute],
        }))
        return createdRoute
      } catch (error) {
        console.error('Failed to create genre route:', error)
        throw error
      }
    },

    updateGenreRoute: async (id, updates) => {
      try {
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

        await get().fetchGenreRoutes()
      } catch (error) {
        console.error('Failed to update genre route:', error)
        throw error
      }
    },

    deleteGenreRoute: async (id) => {
      try {
        const response = await fetch(`/v1/radarr/genre-routes/${id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete Radarr genre route')
        }

        set((state) => ({
          genreRoutes: state.genreRoutes.filter((route) => route.id !== id),
        }))
      } catch (error) {
        console.error('Failed to delete genre route:', error)
        throw error
      }
    },
  })),
)
