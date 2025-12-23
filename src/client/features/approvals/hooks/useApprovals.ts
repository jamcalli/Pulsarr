import {
  type ApprovalRequestsListResponse,
  ApprovalRequestsListResponseSchema,
  type GetApprovalRequestsQuery,
} from '@root/schemas/approval/approval.schema'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { apiClient } from '@/lib/apiClient'
import { useAppQuery } from '@/lib/useAppQuery'

/**
 * Query key factory for approval-related queries.
 * Centralized key management enables targeted cache invalidation.
 */
export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (query: Partial<GetApprovalRequestsQuery>) =>
    [...approvalKeys.lists(), query] as const,
}

/**
 * React Query hook for fetching approval requests.
 *
 * Reads filter params from the approvals store so all consumers
 * share the same query and data.
 *
 * Uses `useAppQuery` wrapper which enforces minimum loading duration
 * for consistent skeleton loader behavior.
 *
 * @returns Query result with approval requests list
 *
 * @example
 * ```typescript
 * // All calls share the same query based on store params
 * const { data, isLoading, error, refetch } = useApprovals()
 *
 * // Change filters via the store
 * useApprovalsStore.getState().setQuery({ status: 'pending' })
 * ```
 */
export function useApprovals() {
  const currentQuery = useApprovalsStore((s) => s.currentQuery)

  return useAppQuery<ApprovalRequestsListResponse>({
    queryKey: approvalKeys.list(currentQuery),
    queryFn: () => {
      const params = new URLSearchParams()

      for (const [key, value] of Object.entries(currentQuery)) {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString())
        }
      }

      return apiClient.get(
        `/v1/approval/requests?${params}`,
        ApprovalRequestsListResponseSchema,
      )
    },
  })
}
