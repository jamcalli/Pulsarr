import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import { useConfigStore } from '@/stores/configStore'

interface DashboardStatsState {
  isLoading: boolean
  lastRefreshed: Date
  mostWatchedShows: ContentStat[] | null
  mostWatchedMovies: ContentStat[] | null
  loadingStates: {
    all: boolean
    shows: boolean
    movies: boolean
  }
  errorStates: {
    all: string | null
    shows: string | null
    movies: string | null
  }
  refreshStats: (params?: { limit?: number; days?: number }) => Promise<void>
}

export function useDashboardStats(): DashboardStatsState {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const isConfigInitialized = useConfigStore(useShallow((s) => s.isInitialized))

  const {
    fetchAllStats,
    mostWatchedMovies,
    mostWatchedShows,
    loading,
    errors,
  } = useDashboardStore()

  const refreshStats = useCallback(
    async (params: { limit?: number; days?: number } = {}) => {
      try {
        const { limit = 10, days } = params
        await fetchAllStats({ limit, days })
        setLastRefreshed(new Date())
      } catch (error) {
        console.error('Error refreshing stats:', error)
      }
    },
    [fetchAllStats],
  )

  // Auto-initialize stats on mount, but only after config is ready
  useEffect(() => {
    if (!isConfigInitialized) return
    refreshStats()
  }, [refreshStats, isConfigInitialized])

  return {
    isLoading: loading.all,
    lastRefreshed,
    mostWatchedShows,
    mostWatchedMovies,
    loadingStates: {
      all: loading.all,
      shows: loading.shows,
      movies: loading.movies,
    },
    errorStates: {
      all: errors.all,
      shows: errors.shows,
      movies: errors.movies,
    },
    refreshStats,
  }
}
