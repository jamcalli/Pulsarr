import type {
  RecentRequestItem,
  RecentRequestStatus,
} from '@root/schemas/dashboard/recent-requests.schema'
import { keepPreviousData } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

const POLLING_INTERVAL = 30_000 // 30 seconds

export const STATUS_FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Requested', value: 'requested' },
  { label: 'Available', value: 'available' },
] as const

export const LIMIT_PRESETS = [10, 20, 30, 50] as const
export type LimitPreset = (typeof LIMIT_PRESETS)[number]

export function getLimitLabel(limit: number): string {
  return `${limit} items`
}

export type StatusFilterValue = 'all' | RecentRequestStatus

/**
 * Key prefix covering every params variant of the recent requests query.
 */
export const recentRequestsKeys = {
  all: $api.queryOptions('get', '/v1/stats/recent-requests').queryKey,
}

const STATUS_VALUES: readonly string[] = [
  'pending_approval',
  'pending',
  'requested',
  'available',
]

function toStatusFilter(value: string): StatusFilterValue {
  return STATUS_VALUES.includes(value) ? (value as RecentRequestStatus) : 'all'
}

interface UseRecentRequestsOptions {
  initialLimit?: LimitPreset
  status?: StatusFilterValue
}

interface UseRecentRequestsReturn {
  items: RecentRequestItem[]
  isLoading: boolean
  error: string | null
  status: string
  setStatus: (status: string) => void
  limit: number
  setLimit: (limit: number) => void
  refetch: () => Promise<void>
}

/**
 * Hook for fetching recent requests for the dashboard carousel.
 * Combines pending approvals and routed watchlist items.
 *
 * SSE updates are handled centrally by useDashboardSSE at the page level.
 * This hook also polls periodically to catch status changes (grabbed -> notified).
 */
export function useRecentRequests(
  options: UseRecentRequestsOptions = {},
): UseRecentRequestsReturn {
  const [limit, setLimit] = useState<number>(options.initialLimit ?? 10)
  const [status, setStatus] = useState<StatusFilterValue>(
    options.status ?? 'all',
  )

  const { data, isLoading, error, refetch } = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/stats/recent-requests',
      {
        params: {
          query: {
            limit,
            ...(status !== 'all' ? { status } : {}),
          },
        },
      },
      {
        placeholderData: keepPreviousData,
        refetchInterval: POLLING_INTERVAL,
        refetchOnWindowFocus: true,
      },
    ),
  )

  const handleRefetch = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    items: data?.items ?? [],
    isLoading,
    error: apiErrorMessage(error),
    status,
    setStatus: useCallback((value: string) => {
      setStatus(toStatusFilter(value))
    }, []),
    limit,
    setLimit,
    refetch: handleRefetch,
  }
}
