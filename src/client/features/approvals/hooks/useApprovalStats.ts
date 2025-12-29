import {
  type ApprovalStatsResponse,
  ApprovalStatsResponseSchema,
} from '@root/schemas/approval/approval.schema'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

/**
 * Query key for approval stats.
 * Separate from approval list keys for independent invalidation.
 */
export const approvalStatsKeys = {
  all: ['approval-stats'] as const,
}

/**
 * React Query hook for fetching approval statistics.
 *
 * Returns aggregate counts by status (pending, approved, rejected, expired, auto_approved).
 * Uses `useAppQuery` wrapper for minimum loading duration.
 *
 * @returns Query result with approval stats
 *
 * @example
 * ```typescript
 * const { data, isLoading, error } = useApprovalStats()
 *
 * if (data) {
 *   console.log(data.stats.pending) // Number of pending approvals
 *   console.log(data.stats.totalRequests) // Total across all statuses
 * }
 * ```
 */
export function useApprovalStats() {
  return useAppQuery<ApprovalStatsResponse>({
    queryKey: approvalStatsKeys.all,
    queryFn: () =>
      apiClient.get('/v1/approval/stats', ApprovalStatsResponseSchema),
  })
}
