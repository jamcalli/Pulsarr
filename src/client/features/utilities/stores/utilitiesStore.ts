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
  loading: {
    schedules: boolean
    deleteSyncDryRun: boolean
    runSchedule: boolean
    toggleSchedule: boolean
  }
  error: {
    schedules: string | null
    deleteSyncDryRun: string | null
    runSchedule: string | null
    toggleSchedule: string | null
  }

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
    loading: {
      schedules: false,
      deleteSyncDryRun: false,
      runSchedule: false,
      toggleSchedule: false,
    },
    error: {
      schedules: null,
      deleteSyncDryRun: null,
      runSchedule: null,
      toggleSchedule: null,
    },

    resetErrors: () => {
      set((state) => ({
        ...state,
        error: {
          schedules: null,
          deleteSyncDryRun: null,
          runSchedule: null,
          toggleSchedule: null,
        },
      }))
    },

    fetchSchedules: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, schedules: true },
        error: { ...state.error, schedules: null },
      }))

      try {
        const response = await fetch('/v1/scheduler/schedules')
        if (!response.ok) {
          throw new Error('Failed to fetch schedules')
        }

        const data: JobStatus[] = await response.json()

        // Apply minimum loading time for a consistent UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )
        await minimumLoadingTime

        set((state) => ({
          ...state,
          schedules: data,
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
        const response = await fetch(
          '/v1/scheduler/schedules/delete-sync/dry-run',
          {
            method: 'POST',
          },
        )

        if (!response.ok) {
          throw new Error('Failed to run delete sync dry run')
        }

        const data = await response.json()

        // Apply minimum loading time for a consistent UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )
        await minimumLoadingTime

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
        const response = await fetch(`/v1/scheduler/schedules/${name}/run`, {
          method: 'POST',
        })

        if (!response.ok) {
          throw new Error(`Failed to run schedule ${name}`)
        }

        const data = await response.json()

        // Apply minimum loading time for a consistent UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )
        await minimumLoadingTime

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
        const response = await fetch(`/v1/scheduler/schedules/${name}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled }),
        })

        if (!response.ok) {
          throw new Error(`Failed to toggle schedule ${name}`)
        }

        const data = await response.json()

        // Apply minimum loading time for a consistent UX
        const minimumLoadingTime = new Promise((resolve) =>
          setTimeout(resolve, MIN_LOADING_DELAY),
        )
        await minimumLoadingTime

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
