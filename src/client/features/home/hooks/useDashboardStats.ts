import { keepPreviousData } from '@tanstack/react-query'
import {
  dashboardDaysPref,
  rankingLimitPref,
} from '@/features/home/lib/home-prefs'
import { useMinDuration, useMinLoading } from '@/hooks/useMinLoading'
import { refreshDashboardStats } from '@/lib/dashboard-invalidation'
import { usePref } from '@/lib/prefs'
import { $api, isSettled, loadErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

export type DashboardStatsData = components['schemas']['DashboardStats']

export type DashboardStats = ReturnType<typeof useDashboardStats>

export function useDashboardStats() {
  const [days, setDays] = usePref(dashboardDaysPref)
  const [limit, setLimit] = usePref(rankingLimitPref)

  const query = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/stats/all',
      { params: { query: { days, limit } } },
      { placeholderData: keepPreviousData },
    ),
  )

  return {
    days,
    setDays,
    limit,
    setLimit,
    data: query.data,
    isLoading: query.isLoading,
    isReady: isSettled(query),
    isRefreshing: useMinDuration(query.isFetching && query.data !== undefined),
    updatedAt: query.dataUpdatedAt,
    refresh: () => void refreshDashboardStats(),
    errorMessage: loadErrorMessage(query, 'Dashboard stats failed to load.'),
  }
}
