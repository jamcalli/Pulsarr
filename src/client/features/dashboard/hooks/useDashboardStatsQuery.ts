import {
  type DashboardStats,
  DashboardStatsSchema,
} from '@root/schemas/stats/stats.schema'
import { keepPreviousData } from '@tanstack/react-query'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

/**
 * Core React Query hook for fetching dashboard statistics.
 *
 * Reads filter params (days, limit) from the dashboard store so all
 * consumers share the same query and data.
 *
 * Uses `useAppQuery` wrapper which enforces minimum loading duration
 * for consistent skeleton loader behavior.
 *
 * @example
 * ```typescript
 * // All calls share the same query based on store params
 * const { data, isLoading, error, refetch } = useDashboardStatsQuery()
 *
 * // Change params via the store
 * useDashboardStore.getState().setDays(7)
 * ```
 */
export function useDashboardStatsQuery() {
  const days = useDashboardStore((s) => s.days)
  const limit = useDashboardStore((s) => s.limit)

  return useAppQuery<DashboardStats>({
    queryKey: ['dashboard-stats', { days, limit }],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const searchParams = new URLSearchParams({
        days: days.toString(),
        limit: limit.toString(),
      })
      return apiClient.get(
        `/v1/stats/all?${searchParams}`,
        DashboardStatsSchema,
      )
    },
  })
}
