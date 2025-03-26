import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  JobStatus,
  DeleteSyncResult,
} from '@root/schemas/scheduler/scheduler.schema'

// Minimum loading delay for consistent UX
const MIN_LOADING_DELAY = 500

export interface UtilitiesState {
  schedules: JobStatus[] | null
  deleteSyncDryRunResults: DeleteSyncResult | null
  isLoadingRef: boolean
  loading: {
    schedules: boolean
    deleteSyncDryRun: boolean
    runSchedule: boolean
    toggleSchedule: boolean
    saveSettings: boolean
  }
  error: {
    schedules: string | null
    deleteSyncDryRun: string | null
    runSchedule: string | null
    toggleSchedule: string | null
    saveSettings: string | null
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
}

export const useUtilitiesStore = create<UtilitiesState>()(
  devtools((set, get) => ({
    schedules: null,
    deleteSyncDryRunResults: null,
    hasLoadedSchedules: false,
    isLoadingRef: false,
    loading: {
      schedules: false,
      deleteSyncDryRun: false,
      runSchedule: false,
      toggleSchedule: false,
      saveSettings: false,
    },
    error: {
      schedules: null,
      deleteSyncDryRun: null,
      runSchedule: null,
      toggleSchedule: null,
      saveSettings: null,
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
  })),
)
