import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { $api } from '@/lib/tanstackApi'
import { useProgressStore } from '@/stores/progressStore'

const approvalStatsKey = $api.queryOptions('get', '/v1/approval/stats').queryKey

export function usePendingApprovalCount(): number {
  const queryClient = useQueryClient()
  const subscribeToType = useProgressStore((state) => state.subscribeToType)
  const query = $api.useQuery('get', '/v1/approval/stats')

  useEffect(
    () =>
      subscribeToType('approval', () => {
        queryClient.invalidateQueries({ queryKey: approvalStatsKey })
      }),
    [subscribeToType, queryClient],
  )

  return query.data?.stats.pending ?? 0
}
