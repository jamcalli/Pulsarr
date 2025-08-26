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

/**
 * React hook that exposes dashboard statistics state and a refresh function.
 *
 * Provides most-watched shows and movies, loading/error states, a nullable
 * `lastRefreshed` timestamp, and a `refreshStats` method to re-fetch stats.
 *
 * The returned `isLoading` is true until the application configuration is
 * initialized, then mirrors the dashboard store's loading flag. `lastRefreshed`
 * is null until a successful fetch occurs and is updated only when a fetch
 * actually ran and returned a positive result.
 *
 * Calling `refreshStats(params?)` will:
 * - no-op if a global loading is already in progress,
 * - coerce `limit` to an integer >= 1 (default 10),
 * - accept an optional positive integer `days` or omit it,
 * - invoke the store refresh action and update `lastRefreshed` only if a fetch ran.
 *
 * The hook also triggers one automatic refresh after the config becomes
 * initialized (runs once per component lifetime).
 *
 * @returns DashboardStatsState containing:
 * - isLoading: whether stats are currently loading (considers config readiness),
 * - lastRefreshed: Date | null — time of the last successful fetch,
 * - mostWatchedShows / mostWatchedMovies: arrays or null,
 * - loadingStates / errorStates: mapped from the store's global flags,
 * - refreshStats: function to manually request a refresh.
 */
export function useDashboardStats(): DashboardStatsState {
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const initialFetchDoneRef = useRef(false)

  const isConfigInitialized = useConfigStore((s) => s.isInitialized)

  const {
    refreshAllStats,
    mostWatchedMovies,
    mostWatchedShows,
    loading,
    errors,
  } = useDashboardStore(
    useShallow((s) => ({
      refreshAllStats: s.refreshAllStats,
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
        const didFetch = await refreshAllStats({
          limit: safeLimit,
          days: safeDays,
        })
        if (didFetch) {
          setLastRefreshed(new Date())
        }
      } catch (error) {
        console.error('Error refreshing stats:', error)
      }
    },
    [refreshAllStats, loading.all],
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
      shows: loading.all,
      movies: loading.all,
    },
    errorStates: {
      all: errors.all,
      shows: errors.all,
      movies: errors.all,
    },
    refreshStats,
  }
}
