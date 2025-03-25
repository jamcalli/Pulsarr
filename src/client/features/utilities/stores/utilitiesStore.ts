import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { JobStatus, DeleteSyncResult } from '@root/schemas/scheduler/scheduler.schema'

export interface UtilitiesState {
  schedules: JobStatus[] | null
  deleteSyncDryRunResults: DeleteSyncResult | null
  loading: {
    schedules: boolean
    deleteSyncDryRun: boolean
  }
  error: {
    schedules: string | null
    deleteSyncDryRun: string | null
  }

  // Fetch functions
  fetchSchedules: () => Promise<void>
  runDryDeleteSync: () => Promise<void>
  runScheduleNow: (name: string) => Promise<boolean>
  toggleScheduleStatus: (name: string, enabled: boolean) => Promise<boolean>
}

export const useUtilitiesStore = create<UtilitiesState>()(
  devtools((set, get) => ({
    schedules: null,
    deleteSyncDryRunResults: null,
    loading: {
      schedules: false,
      deleteSyncDryRun: false
    },
    error: {
      schedules: null,
      deleteSyncDryRun: null
    },

    fetchSchedules: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, schedules: true },
        error: { ...state.error, schedules: null }
      }))

      try {
        const response = await fetch('/v1/scheduler/schedules')
        if (!response.ok) {
          throw new Error('Failed to fetch schedules')
        }

        const data: JobStatus[] = await response.json()
        
        set((state) => ({
          ...state,
          schedules: data,
          loading: { ...state.loading, schedules: false }
        }))
      } catch (err) {
        console.error('Error fetching schedules:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, schedules: false },
          error: { ...state.error, schedules: err instanceof Error ? err.message : 'Unknown error' }
        }))
      }
    },

    runDryDeleteSync: async () => {
      set((state) => ({
        ...state,
        loading: { ...state.loading, deleteSyncDryRun: true },
        error: { ...state.error, deleteSyncDryRun: null }
      }))

      try {
        const response = await fetch('/v1/scheduler/schedules/delete-sync/dry-run', {
          method: 'POST'
        })

        if (!response.ok) {
          throw new Error('Failed to run delete sync dry run')
        }

        const data = await response.json()
        
        set((state) => ({
          ...state,
          deleteSyncDryRunResults: data.results,
          loading: { ...state.loading, deleteSyncDryRun: false }
        }))

        return data.results
      } catch (err) {
        console.error('Error running delete sync dry run:', err)
        set((state) => ({
          ...state,
          loading: { ...state.loading, deleteSyncDryRun: false },
          error: { 
            ...state.error, 
            deleteSyncDryRun: err instanceof Error ? err.message : 'Unknown error' 
          }
        }))
        throw err
      }
    },

    runScheduleNow: async (name: string) => {
      try {
        const response = await fetch(`/v1/scheduler/schedules/${name}/run`, {
          method: 'POST'
        })

        if (!response.ok) {
          throw new Error(`Failed to run schedule ${name}`)
        }

        const data = await response.json()
        
        // Refresh schedules after running a job
        await get().fetchSchedules()
        
        return data.success
      } catch (err) {
        console.error(`Error running schedule ${name}:`, err)
        return false
      }
    },

    toggleScheduleStatus: async (name: string, enabled: boolean) => {
      try {
        const response = await fetch(`/v1/scheduler/schedules/${name}/toggle`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ enabled })
        })

        if (!response.ok) {
          throw new Error(`Failed to toggle schedule ${name}`)
        }

        const data = await response.json()
        
        // Refresh schedules after toggling
        await get().fetchSchedules()
        
        return data.success
      } catch (err) {
        console.error(`Error toggling schedule ${name}:`, err)
        return false
      }
    }
  }))
)