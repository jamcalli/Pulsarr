import type {
  RecentRequestItem,
  RecentRequestStatus,
  RecentRequestsResponse,
} from '@root/schemas/dashboard/recent-requests.schema'
import { RecentRequestsResponseSchema } from '@root/schemas/dashboard/recent-requests.schema'
import { keepPreviousData } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

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
  const [status, setStatus] = useState<string>(options.status ?? 'all')

  const queryKey = ['recent-requests', { limit, status }]

  const { data, isLoading, error, refetch } =
    useAppQuery<RecentRequestsResponse>({
      queryKey,
      placeholderData: keepPreviousData,
      refetchInterval: POLLING_INTERVAL,
      refetchOnWindowFocus: true,
      queryFn: () => {
        const searchParams = new URLSearchParams({
          limit: limit.toString(),
        })
        if (status !== 'all') {
          searchParams.set('status', status)
        }
        return apiClient.get(
          `/v1/stats/recent-requests?${searchParams}`,
          RecentRequestsResponseSchema,
        )
      },
    })

  const handleRefetch = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    items: data?.items ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    status,
    setStatus,
    limit,
    setLimit,
    refetch: handleRefetch,
  }
}
