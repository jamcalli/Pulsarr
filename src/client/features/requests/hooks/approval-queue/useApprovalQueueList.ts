import { keepPreviousData } from '@tanstack/react-query'
import {
  type QueueState,
  requestQuery,
} from '@/features/requests/lib/approval-queue/queue-state'
import { useApprovalEvents } from '@/hooks/useApprovalEvents'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useMinLoading } from '@/hooks/useMinLoading'
import { SEARCH_DEBOUNCE_DELAY } from '@/lib/constants'
import { approvalRequestsKeys, approvalStatsKeys } from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export function invalidateApprovalQueue() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: approvalRequestsKeys.all }),
    queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all }),
  ])
}

export function useApprovalQueueList(state: QueueState) {
  const q = useDebouncedValue(state.q, SEARCH_DEBOUNCE_DELAY)
  const list = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/approval/requests',
      { params: { query: requestQuery({ ...state, q }) } },
      { placeholderData: keepPreviousData },
    ),
  )
  const stats = $api.useQuery('get', '/v1/approval/stats')
  useApprovalEvents(invalidateApprovalQueue)

  const failed = list.isError ? list.error : stats.isError ? stats.error : null

  return {
    rows: list.data?.approvalRequests ?? null,
    total: list.data?.total ?? 0,
    stats: stats.data?.stats ?? null,
    isLoading: list.isLoading,
    errorMessage:
      failed === null
        ? null
        : (apiErrorMessage(failed) ?? "Couldn't load the approval queue."),
    retry: () => void invalidateApprovalQueue(),
  }
}
