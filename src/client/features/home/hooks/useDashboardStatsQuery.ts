import { keepPreviousData } from '@tanstack/react-query'
import { useDashboardStore } from '@/features/home/store/dashboardStore'
import { useMinLoading } from '@/hooks/useMinLoading'
import { $api } from '@/lib/tanstackApi'

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
