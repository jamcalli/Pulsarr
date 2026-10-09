import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useApprovalEvents } from '@/hooks/useApprovalEvents'
import { approvalStatsKeys } from '@/lib/query-keys'
import { $api } from '@/lib/tanstackApi'

export function usePendingApprovalCount(): number {
  const queryClient = useQueryClient()
  const query = $api.useQuery('get', '/v1/approval/stats')

  useApprovalEvents(
    useCallback(
      () => queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all }),
      [queryClient],
    ),
  )

  return query.data?.stats.pending ?? 0
}
