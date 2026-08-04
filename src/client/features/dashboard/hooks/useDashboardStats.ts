import type { ContentStat } from '@root/schemas/stats/stats.schema'
import { useCallback } from 'react'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import { queryClient } from '@/lib/queryClient'
import { apiErrorMessage } from '@/lib/tanstackApi'
import { useMinDuration } from '@/lib/useMinLoading'
import { useConfigStore } from '@/stores/configStore'
import {
  dashboardStatsKeys,
  useDashboardStatsQuery,
} from './useDashboardStatsQuery'

// Re-export presets from store for convenience
export {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  getDateRangeLabel,
  getLimitLabel,
  LIMIT_PRESETS,
  type LimitPreset,
} from '@/features/dashboard/store/dashboardStore'

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
  days: number
  setDays: (days: number) => void
  limit: number
  setLimit: (limit: number) => void
  refreshStats: () => Promise<void>
  isRefreshing: boolean
}

/**
 * React hook that exposes dashboard statistics state and a refresh function.
 *
 * Wraps the React Query `useDashboardStatsQuery` hook and provides a
 * compatible API for existing components.
 *
 * Filter params (days) are stored in the dashboard store and shared
 * across all consumers.
 *
 * @returns DashboardStatsState containing:
 * - isLoading: whether stats are currently loading (considers config readiness)
 * - lastRefreshed: Date | null - time of the last successful fetch
 * - mostWatchedShows / mostWatchedMovies: arrays or null
 * - loadingStates / errorStates: mapped from query state
 * - days: current date range in days
 * - setDays: function to change date range
 * - refreshStats: function to manually request a refresh
 */
export function useDashboardStats(): DashboardStatsState {
  const days = useDashboardStore((s) => s.days)
  const setDays = useDashboardStore((s) => s.setDays)
  const limit = useDashboardStore((s) => s.limit)
  const setLimit = useDashboardStore((s) => s.setLimit)

  const isConfigInitialized = useConfigStore((s) => s.isInitialized)

  const { data, isLoading, isFetching, error, dataUpdatedAt } =
    useDashboardStatsQuery()

  const errorMessage = apiErrorMessage(error)

  // Refetches in the background - existing cards stay visible instead of
  // resetting to skeletons
  const refreshStats = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: dashboardStatsKeys.all })
  }, [])

  const isRefreshing = useMinDuration(isFetching && data !== undefined)

  // Cards must not show their empty states before the first load completes -
  // "no data" is only knowable once data exists
  const hasData = data !== undefined

  return {
    isLoading: !isConfigInitialized || isLoading || !hasData,
    isRefreshing,
    lastRefreshed: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
    mostWatchedShows: data?.most_watched_shows ?? null,
    mostWatchedMovies: data?.most_watched_movies ?? null,
    loadingStates: {
      all: isLoading || !hasData,
      shows: isLoading || !hasData,
      movies: isLoading || !hasData,
    },
    errorStates: {
      all: errorMessage,
      shows: errorMessage,
      movies: errorMessage,
    },
    days,
    setDays,
    limit,
    setLimit,
    refreshStats,
  }
}
