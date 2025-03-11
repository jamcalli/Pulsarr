import { useState, useCallback } from 'react'
import { useDashboardStore } from '../store/dashboardStore'
import type { ContentStat } from '@root/schemas/stats/stats.schema'

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
  const [isLoading, setIsLoading] = useState<boolean>(true)
  
  const { 
    fetchAllStats, 
    mostWatchedMovies, 
    mostWatchedShows, 
    loading, 
    errors
  } = useDashboardStore()

  const refreshStats = useCallback(async (params?: { limit?: number; days?: number }) => {
    setIsLoading(true)
    await fetchAllStats(params || { limit: 10 })
    setIsLoading(false)
    setLastRefreshed(new Date())
  }, [fetchAllStats])

  return {
    isLoading,
    lastRefreshed,
    mostWatchedShows,
    mostWatchedMovies,
    loadingStates: {
      all: loading.all,
      shows: loading.shows,
      movies: loading.movies
    },
    errorStates: {
      all: errors.all,
      shows: errors.shows,
      movies: errors.movies
    },
    refreshStats
  }
}