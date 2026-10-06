import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { approvalStatsKeys } from '@/lib/query-keys'
import { $api } from '@/lib/tanstackApi'
import { useProgressStore } from '@/stores/progressStore'

export function usePendingApprovalCount(): number {
  const queryClient = useQueryClient()
  const subscribeToType = useProgressStore((state) => state.subscribeToType)
  const query = $api.useQuery('get', '/v1/approval/stats')

  useEffect(
    () =>
      subscribeToType('approval', () => {
        queryClient.invalidateQueries({ queryKey: approvalStatsKeys.all })
      }),
    [subscribeToType, queryClient],
  )

  return query.data?.stats.pending ?? 0
}
