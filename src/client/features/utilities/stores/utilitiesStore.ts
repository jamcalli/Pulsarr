import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  JobStatus,
  DeleteSyncResult,
} from '@root/schemas/scheduler/scheduler.schema'
import type {
  TaggingConfigSchema,
  TaggingStatusResponseSchema,
  CreateTaggingResponseSchema,
  SyncTaggingResponseSchema,
  CleanupResponseSchema,
  RemoveTagsResponseSchema,
} from '@root/schemas/tags/user-tags.schema'
import type { z } from 'zod'

// Single type alias needed for the function parameter
type TaggingConfig = z.infer<typeof TaggingConfigSchema>

// Use the existing schema type for the return type
export type TagRemovalResult = z.infer<typeof RemoveTagsResponseSchema>

// Minimum loading delay for consistent UX
const MIN_LOADING_DELAY = 500

export interface UtilitiesState {
  schedules: JobStatus[] | null
  deleteSyncDryRunResults: DeleteSyncResult | null
  isLoadingRef: boolean
  removeTagsResults: TagRemovalResult | null
  showDeleteTagsConfirmation: boolean
  loading: {
    schedules: boolean
    deleteSyncDryRun: boolean
    runSchedule: boolean
    toggleSchedule: boolean
    saveSettings: boolean
    userTags: boolean
    createUserTags: boolean
    syncUserTags: boolean
    cleanupUserTags: boolean
    removeUserTags: boolean
  }
  error: {
    schedules: string | null
    deleteSyncDryRun: string | null
    runSchedule: string | null
    toggleSchedule: string | null
    saveSettings: string | null
    userTags: string | null
    createUserTags: string | null
    syncUserTags: string | null
    cleanupUserTags: string | null
    removeUserTags: string | null
  }
  hasLoadedSchedules: boolean

  // Loading state management
  setLoadingWithMinDuration: (loading: boolean) => void

  // Fetch functions
  fetchSchedules: () => Promise<void>
  runDryDeleteSync: () => Promise<void>
  runScheduleNow: (name: string) => Promise<boolean>
  toggleScheduleStatus: (name: string, enabled: boolean) => Promise<boolean>
  resetErrors: () => void

  // User tags functions
  fetchUserTagsConfig: () => Promise<
    z.infer<typeof TaggingStatusResponseSchema>
  >
  updateUserTagsConfig: (
    config: TaggingConfig,
  ) => Promise<z.infer<typeof TaggingStatusResponseSchema>>
  createUserTags: () => Promise<z.infer<typeof CreateTaggingResponseSchema>>
  syncUserTags: () => Promise<z.infer<typeof SyncTaggingResponseSchema>>
  cleanupUserTags: () => Promise<z.infer<typeof CleanupResponseSchema>>
  setShowDeleteTagsConfirmation: (show: boolean) => void
  removeUserTags: (deleteTagDefinitions: boolean) => Promise<TagRemovalResult>
}

export const useUtilitiesStore = create<UtilitiesState>()(
  devtools((set, get) => ({
    schedules: null,
    deleteSyncDryRunResults: null,
    hasLoadedSchedules: false,
    isLoadingRef: false,
    removeTagsResults: null,
    showDeleteTagsConfirmation: false,
    loading: {
      schedules: false,
      deleteSyncDryRun: false,
      runSchedule: false,
      toggleSchedule: false,
      saveSettings: false,
      userTags: false,
      createUserTags: false,
      syncUserTags: false,
      cleanupUserTags: false,
      removeUserTags: false,
    },
    error: {
      schedules: null,
      deleteSyncDryRun: null,
      runSchedule: null,
      toggleSchedule: null,
      saveSettings: null,
      userTags: null,
      createUserTags: null,
      syncUserTags: null,
      cleanupUserTags: null,
      removeUserTags: null,
    },

    // Loading state management that mimics your pattern in other components
    setLoadingWithMinDuration: (loading) => {
      const state = get()

      if (loading) {
        if (!state.isLoadingRef) {
          set({
            isLoadingRef: true,
            loading: { ...state.loading, saveSettings: true },
          })
        }
      } else {
        setTimeout(() => {
          set({
            isLoadingRef: false,
            loading: { ...state.loading, saveSettings: false },
          })
        }, 500)
      }
    },

    resetErrors: () => {
      set((state) => ({
        ...state,
        error: {
          schedules: null,
          deleteSyncDryRun: null,
          runSchedule: null,
          toggleSchedule: null,
          saveSettings: null,
          userTags: null,
          createUserTags: null,
          syncUserTags: null,
          cleanupUserTags: null,
          removeUserTags: null,
        },
      }))
    },

    fetchSchedules: async () => {
      // If we've already loaded schedules once and they're in memory,
      // don't show loading state on subsequent navigations
      const isInitialLoad = !get().hasLoadedSchedules

      if (isInitialLoad) {
        set((state) => ({
          ...state,
          loading: { ...state.loading, schedules: true },
          error: { ...state.error, schedules: null },
        }))
      }

      try {
        // For initial loads, set up a minimum loading time
        const minimumLoadingTime = isInitialLoad
          ? new Promise((resolve) => setTimeout(resolve, MIN_LOADING_DELAY))
          : Promise.resolve()

        // Fetch data
        const responsePromise = fetch('/v1/scheduler/schedules')

        // Wait for both the response and (if initial load) the minimum time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to fetch schedules')
        }

        const data: JobStatus[] = await response.json()

        set((state) => ({
          ...state,
          schedules: data,
          hasLoadedSchedules: true,
          loading: { ...state.loading, schedules: false },
        }))
      } catch (err) {
        console.error('Error fetching schedules:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, schedules: false },
          error: {
            ...state.error,
            schedules: err instanceof Error ? err.message : 'Unknown error',
          },
        }))
      }
    },

    setShowDeleteTagsConfirmation: (show: boolean) => {
      set({ showDeleteTagsConfirmation: show })
    },

    // Remove user tags with proper typing using the imported schema
    removeUserTags: async (
      deleteTagDefinitions: boolean,
    ): Promise<TagRemovalResult> => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, removeUserTags: true },
        error: { ...state.error, removeUserTags: null },
      }))

      try {
        // Create a minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch
        const responsePromise = fetch('/v1/tags/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deleteTagDefinitions }),
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to remove user tags')
        }

        const data: TagRemovalResult = await response.json()

        // Store the results
        set((state) => ({
          ...state,
          removeTagsResults: data,
          loading: { ...state.loading, removeUserTags: false },
        }))

        return data
      } catch (err) {
        console.error('Error removing user tags:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, removeUserTags: false },
          error: {
            ...state.error,
            removeUserTags:
              err instanceof Error ? err.message : 'Failed to remove user tags',
          },
        }))
        throw err
      }
    },

    runDryDeleteSync: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, deleteSyncDryRun: true },
        error: { ...state.error, deleteSyncDryRun: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch
        const responsePromise = fetch(
          '/v1/scheduler/schedules/delete-sync/dry-run',
          {
            method: 'POST',
          },
        )

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to run delete sync dry run')
        }

        const data = await response.json()

        set((state) => ({
          ...state,
          deleteSyncDryRunResults: data.results,
          loading: { ...state.loading, deleteSyncDryRun: false },
        }))

        return data.results
      } catch (err) {
        console.error('Error running delete sync dry run:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, deleteSyncDryRun: false },
          error: {
            ...state.error,
            deleteSyncDryRun:
              err instanceof Error ? err.message : 'Unknown error',
          },
        }))
        throw err
      }
    },

    runScheduleNow: async (name: string) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, runSchedule: true },
        error: { ...state.error, runSchedule: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch
        const responsePromise = fetch(`/v1/scheduler/schedules/${name}/run`, {
          method: 'POST',
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error(`Failed to run schedule ${name}`)
        }

        const data = await response.json()

        // Refresh schedules after running a job
        await get().fetchSchedules()

        set((state) => ({
          ...state,
          loading: { ...state.loading, runSchedule: false },
        }))

        return data.success
      } catch (err) {
        console.error(`Error running schedule ${name}:`, err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, runSchedule: false },
          error: {
            ...state.error,
            runSchedule:
              err instanceof Error ? err.message : `Failed to run ${name}`,
          },
        }))
        return false
      }
    },

    toggleScheduleStatus: async (name: string, enabled: boolean) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, toggleSchedule: true },
        error: { ...state.error, toggleSchedule: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch
        const responsePromise = fetch(
          `/v1/scheduler/schedules/${name}/toggle`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ enabled }),
          },
        )

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error(`Failed to toggle schedule ${name}`)
        }

        const data = await response.json()

        // Refresh schedules after toggling
        await get().fetchSchedules()

        set((state) => ({
          ...state,
          loading: { ...state.loading, toggleSchedule: false },
        }))

        return data.success
      } catch (err) {
        console.error(`Error toggling schedule ${name}:`, err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, toggleSchedule: false },
          error: {
            ...state.error,
            toggleSchedule:
              err instanceof Error ? err.message : `Failed to toggle ${name}`,
          },
        }))
        return false
      }
    },

    // User Tags methods
    fetchUserTagsConfig: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, userTags: true },
        error: { ...state.error, userTags: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch with corrected path
        const responsePromise = fetch('/v1/tags/status')

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to fetch user tags configuration')
        }

        const data = await response.json()

        set((state) => ({
          ...state,
          loading: { ...state.loading, userTags: false },
        }))

        return data
      } catch (err) {
        console.error('Error fetching user tags configuration:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, userTags: false },
          error: {
            ...state.error,
            userTags:
              err instanceof Error
                ? err.message
                : 'Failed to fetch user tags configuration',
          },
        }))
        throw err
      }
    },

    updateUserTagsConfig: async (config: TaggingConfig) => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, userTags: true },
        error: { ...state.error, userTags: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch with corrected path
        const responsePromise = fetch('/v1/tags/config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(config),
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to update user tags configuration')
        }

        const data = await response.json()

        set((state) => ({
          ...state,
          loading: { ...state.loading, userTags: false },
        }))

        return data
      } catch (err) {
        console.error('Error updating user tags configuration:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, userTags: false },
          error: {
            ...state.error,
            userTags:
              err instanceof Error
                ? err.message
                : 'Failed to update user tags configuration',
          },
        }))
        throw err
      }
    },

    createUserTags: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, createUserTags: true },
        error: { ...state.error, createUserTags: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch with corrected path
        const responsePromise = fetch('/v1/tags/create', {
          method: 'POST',
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to create user tags')
        }

        const data = await response.json()

        set((state) => ({
          ...state,
          loading: { ...state.loading, createUserTags: false },
        }))

        return data
      } catch (err) {
        console.error('Error creating user tags:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, createUserTags: false },
          error: {
            ...state.error,
            createUserTags:
              err instanceof Error ? err.message : 'Failed to create user tags',
          },
        }))
        throw err
      }
    },

    syncUserTags: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, syncUserTags: true },
        error: { ...state.error, syncUserTags: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch with corrected path
        const responsePromise = fetch('/v1/tags/sync', {
          method: 'POST',
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to sync user tags')
        }

        const data = await response.json()

        set((state) => ({
          ...state,
          loading: { ...state.loading, syncUserTags: false },
        }))

        return data
      } catch (err) {
        console.error('Error syncing user tags:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, syncUserTags: false },
          error: {
            ...state.error,
            syncUserTags:
              err instanceof Error ? err.message : 'Failed to sync user tags',
          },
        }))
        throw err
      }
    },

    cleanupUserTags: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, cleanupUserTags: true },
        error: { ...state.error, cleanupUserTags: null },
      }))

      try {
        // Create minimum loading time promise
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )

        // Execute fetch with corrected path
        const responsePromise = fetch('/v1/tags/cleanup', {
          method: 'POST',
        })

        // Wait for both the response and the minimum loading time
        const [response] = await Promise.all([
          responsePromise,
          minimumLoadingTime,
        ])

        if (!response.ok) {
          throw new Error('Failed to clean up user tags')
        }

        const data = await response.json()

        set((state) => ({
          ...state,
          loading: { ...state.loading, cleanupUserTags: false },
        }))

        return data
      } catch (err) {
        console.error('Error cleaning up user tags:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, cleanupUserTags: false },
          error: {
            ...state.error,
            cleanupUserTags:
              err instanceof Error
                ? err.message
                : 'Failed to clean up user tags',
          },
        }))
        throw err
      }
    },
  })),
)
