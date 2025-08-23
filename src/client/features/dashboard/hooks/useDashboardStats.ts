import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import { useConfigStore } from '@/stores/configStore'

interface DashboardStatsState {
  isLoading: boolean
  lastRefreshed: Date | null
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
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const initialFetchDoneRef = useRef(false)

  const isConfigInitialized = useConfigStore(useShallow((s) => s.isInitialized))

  const {
    fetchAllStats,
    mostWatchedMovies,
    mostWatchedShows,
    loading,
    errors,
  } = useDashboardStore(
    useShallow((s) => ({
      fetchAllStats: s.fetchAllStats,
      mostWatchedMovies: s.mostWatchedMovies,
      mostWatchedShows: s.mostWatchedShows,
      loading: s.loading,
      errors: s.errors,
    })),
  )

  const refreshStats = useCallback(
    async (params: { limit?: number; days?: number } = {}) => {
      try {
        if (loading.all) return
        const { limit = 10, days } = params
        const safeLimit = Math.max(1, Math.floor(limit))
        const safeDays =
          typeof days === 'number' && Number.isFinite(days) && days > 0
            ? Math.floor(days)
            : undefined
        await fetchAllStats({ limit: safeLimit, days: safeDays })
        setLastRefreshed(new Date())
      } catch (error) {
        console.error('Error refreshing stats:', error)
      }
    },
    [fetchAllStats, loading],
  )

  // Auto-initialize stats on mount, but only after config is ready
  useEffect(() => {
    if (!isConfigInitialized || initialFetchDoneRef.current) return
    initialFetchDoneRef.current = true
    refreshStats()
  }, [refreshStats, isConfigInitialized])

  return {
    // Keep loading true until config is initialized, then reflect store loading
    isLoading: !isConfigInitialized || loading.all,
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
