import { keepPreviousData } from '@tanstack/react-query'
import { useMediaView } from '@/features/home/hooks/useMediaView'
import {
  recentLimitPref,
  recentStatusPref,
  recentViewPref,
} from '@/features/home/lib/home-prefs'
import { useMinLoading } from '@/hooks/useMinLoading'
import { usePref } from '@/lib/prefs'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

export type RecentRequest = components['schemas']['RecentRequestItem']

export type RecentRequestsState = ReturnType<typeof useRecentRequests>

const POLL_INTERVAL_MS = 30_000

export function useRecentRequests() {
  const [view, setView] = useMediaView(recentViewPref)
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
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Recent requests failed to load.')
      : null,
  }
}
