import { keepPreviousData } from '@tanstack/react-query'
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore'
import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

/**
 * Key prefix covering every params variant of the dashboard stats query.
 */
export const dashboardStatsKeys = {
  all: $api.queryOptions('get', '/v1/stats/all').queryKey,
}

/**
 * Fetches dashboard statistics. Reads filter params (days, limit) from the
 * dashboard store so all consumers share the same query and data.
 */
export function useDashboardStatsQuery() {
  const days = useDashboardStore((s) => s.days)
  const limit = useDashboardStore((s) => s.limit)

  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/stats/all',
      { params: { query: { days, limit } } },
      { placeholderData: keepPreviousData },
    ),
  )
}
