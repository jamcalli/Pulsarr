import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

/**
 * Key for approval stats, separate from approval list keys for
 * independent invalidation.
 */
export const approvalStatsKeys = {
  all: ['get', '/v1/approval/stats'] as const,
}

/**
 * Fetches approval statistics: aggregate counts by status
 * (pending, approved, rejected, expired, auto_approved).
 */
export function useApprovalStats() {
  return useMinLoading($api.useQuery('get', '/v1/approval/stats'))
}
