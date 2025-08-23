import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { useCallback, useEffect, useState } from 'react'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'

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

  const {
    fetchAllStats,
    mostWatchedMovies,
    mostWatchedShows,
    loading,
    errors,
  } = useDashboardStore()

  const refreshStats = useCallback(
    async (params?: { limit?: number; days?: number }) => {
      try {
        await fetchAllStats(params || { limit: 10 })
        setLastRefreshed(new Date())
      } catch (error) {
        console.error('Error refreshing stats:', error)
      }
    },
    [fetchAllStats],
  )

  // Auto-initialize stats on mount
  useEffect(() => {
    refreshStats()
  }, [refreshStats])

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
