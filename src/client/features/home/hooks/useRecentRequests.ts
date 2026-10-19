import { keepPreviousData } from '@tanstack/react-query'
import { useMinLoading } from '@/hooks/useMinLoading'
import { usePref } from '@/lib/prefs'
import {
  recentLimitPref,
  recentStatusPref,
  recentViewPref,
} from '@/lib/request-list-prefs'
import { $api, isSettled, loadErrorMessage } from '@/lib/tanstackApi'

export type RecentRequestsState = ReturnType<typeof useRecentRequests>

const POLL_INTERVAL_MS = 30_000

export function useRecentRequests() {
  const [view, setView] = usePref(recentViewPref)
  const [limit, setLimit] = usePref(recentLimitPref)
  const [status, setStatus] = usePref(recentStatusPref)

  const query = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/stats/recent-requests',
      {
        params: {
          query: { limit, status: status === 'all' ? undefined : status },
        },
      },
      { placeholderData: keepPreviousData, refetchInterval: POLL_INTERVAL_MS },
    ),
  )

  return {
    view,
    setView,
    limit,
    setLimit,
    status,
    setStatus,
    items: query.data?.items,
    isLoading: query.isLoading,
    isReady: isSettled(query),
    errorMessage: loadErrorMessage(query, 'Recent requests failed to load.'),
  }
}
