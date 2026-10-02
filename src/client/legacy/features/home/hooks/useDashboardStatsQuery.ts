import { keepPreviousData } from '@tanstack/react-query'
import { useMinLoading } from '@/hooks/useMinLoading'
import { useDashboardStore } from '@/legacy/features/home/store/dashboardStore'
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
