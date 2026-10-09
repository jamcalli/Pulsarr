import type { QueryKey } from '@tanstack/react-query'
import { useApprovalEvents } from '@/hooks/useApprovalEvents'
import {
  approvalRequestsKeys,
  approvalStatsKeys,
  dashboardStatsKeys,
  recentRequestsKeys,
  topGenresKeys,
  topUsersKeys,
} from '@/lib/query-keys'
import { queryClient } from '@/lib/queryClient'

const STATS_KEYS = [dashboardStatsKeys.all, topUsersKeys.all, topGenresKeys.all]

function invalidate(queryKeys: QueryKey[]) {
  return Promise.all(
    queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

/** Refetches every stats query the dashboard range drives. */
export function refreshDashboardStats() {
  return invalidate(STATS_KEYS)
}

export function invalidateDashboard() {
  return invalidate([
    approvalRequestsKeys.all,
    approvalStatsKeys.all,
    recentRequestsKeys.all,
    ...STATS_KEYS,
  ])
}

/** Refetches the dashboard queries whenever an approval event arrives on the progress stream. */
export function useDashboardInvalidation(): void {
  useApprovalEvents(invalidateDashboard)
}
