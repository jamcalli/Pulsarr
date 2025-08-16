import type { ContentRouterRule } from '@root/schemas/content-router/content-router.schema'
import type { QualityProfile, RootFolder } from '@root/types/sonarr.types'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { API_KEY_PLACEHOLDER } from '@/features/sonarr/store/constants'

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
  createSeasonFolders?: boolean
  tags: string[]
  isDefault: boolean
  syncedInstances?: number[]
  seriesType?: 'standard' | 'anime' | 'daily'
  data?: SonarrInstanceData
}

export interface SonarrInstanceData {
  rootFolders?: RootFolder[]
  qualityProfiles?: QualityProfile[]
  fetching?: boolean
}

export interface SonarrState {
  // State
  instances: SonarrInstance[]
  genres: string[]
  isInitialized: boolean
  instancesLoading: boolean
  error: string | null
  contentRouterInitialized: boolean
  contentRouterRules: ContentRouterRule[]

  // Loading management
  isLoadingRef: boolean
  isInitialMount: boolean

  // Actions
  initialize: (force?: boolean) => Promise<void>
  setLoadingWithMinDuration: (loading: boolean) => void
  setContentRouterInitialized: (initialized: boolean) => void

  // Instance operations
  fetchInstances: () => Promise<void>
  fetchInstanceData: (instanceId: string) => Promise<void>
  fetchAllInstanceData: () => Promise<void>
  updateInstance: (
    id: number,
    updates: Partial<SonarrInstance>,
  ) => Promise<void>
  deleteInstance: (id: number) => Promise<void>

  // Genre operations
  fetchGenres: () => Promise<void>
}

export const useSonarrStore = create<SonarrState>()(
  devtools((set, get) => ({
    // Initial state
    instances: [],
    genres: [],
    isInitialized: false,
    instancesLoading: false,
    error: null,
    isLoadingRef: false,
    isInitialMount: true,
    contentRouterInitialized: false,
    contentRouterRules: [],

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
              isDefault: newInst.isDefault,
            }
          }
          return newInst
        })

        set({ instances: mergedInstances })
      } catch (error) {
        set({ error: 'Failed to fetch Sonarr instances' })
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
          (inst) => inst.apiKey && inst.apiKey !== API_KEY_PLACEHOLDER,
        )
        await Promise.all(
          validInstances.map((instance) =>
            state.fetchInstanceData(instance.id.toString()),
          ),
        )
      } catch (error) {
        set({ error: 'Failed to fetch all Sonarr instance data' })
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
          await Promise.all([state.fetchInstances(), state.fetchGenres()])

          set({
            isInitialized: true,
            contentRouterInitialized: true,
            error: null,
          })
        } catch (error) {
          set({
            error: 'Failed to initialize',
            isInitialized: false,
            contentRouterInitialized: false,
          })
          console.error('Initialization error:', error)
        } finally {
          if (state.isInitialMount) {
            state.setLoadingWithMinDuration(false)
          }
        }
      }
    },

    updateInstance: async (id: number, updates: Partial<SonarrInstance>) => {
      const state = get()
      try {
        if (
          updates.isDefault &&
          !state.instances.find((i) => i.id === id)?.isDefault
        ) {
          const updatePromises = state.instances
            .filter((inst) => inst.id !== id && inst.isDefault)
            .map((inst) =>
              fetch(`/v1/sonarr/instances/${inst.id}`, {
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

        const response = await fetch(`/v1/sonarr/instances/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...updates,
            name: updates.name?.trim(),
            syncedInstances: updates.syncedInstances || [],
          }),
        })

        if (!response.ok) {
          // Get the error message from the response
          let errorMessage = 'Failed to update instance'

          try {
            const errorData = await response.json()
            console.log('Sonarr API error response:', errorData) // Debug log

            // Use the error message from the API response if available
            if (errorData && typeof errorData.message === 'string') {
              errorMessage = errorData.message
            }
          } catch (jsonError) {
            console.log('Failed to parse Sonarr error JSON:', jsonError) // Debug log
            // If we can't parse the JSON, fall back to status text
            errorMessage = `Failed to update instance: ${response.statusText}`
          }

          throw new Error(errorMessage)
        }

        await get().fetchInstances()
      } catch (error) {
        console.error('Failed to update instance:', error)
        throw error
      }
    },

    deleteInstance: async (id) => {
      try {
        const response = await fetch(`/v1/sonarr/instances/${id}`, {
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
  })),
)
