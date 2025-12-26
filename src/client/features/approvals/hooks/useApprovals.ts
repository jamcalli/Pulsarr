import {
  type ApprovalRequestsListResponse,
  ApprovalRequestsListResponseSchema,
} from '@root/schemas/approval/approval.schema'
import { keepPreviousData } from '@tanstack/react-query'
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
  list: (params: {
    filters: {
      status: string[]
      userId: number[]
      contentType: string[]
      triggeredBy: string[]
      search: string
    }
    pageIndex: number
    pageSize: number
    sortBy: string
    sortOrder: string
  }) => [...approvalKeys.lists(), params] as const,
}

/**
 * React Query hook for fetching approval requests with server-side pagination and filtering.
 *
 * Reads filter and pagination params from the approvals store so all consumers
 * share the same query and data.
 *
 * Uses `useAppQuery` wrapper which enforces minimum loading duration
 * for consistent skeleton loader behavior.
 *
 * @returns Query result with approval requests list, total count, and pagination info
 *
 * @example
 * ```typescript
 * const { data, isLoading, error } = useApprovals()
 *
 * // Access data
 * const requests = data?.approvalRequests ?? []
 * const total = data?.total ?? 0
 * const pageCount = Math.ceil(total / pageSize)
 *
 * // Change filters via the store
 * useApprovalsStore.getState().setFilters({ status: ['pending'] })
 *
 * // Change page via the store
 * useApprovalsStore.getState().setPageIndex(2)
 * ```
 */
export function useApprovals() {
  const filters = useApprovalsStore((s) => s.filters)
  const pageIndex = useApprovalsStore((s) => s.pageIndex)
  const pageSize = useApprovalsStore((s) => s.pageSize)
  const sortBy = useApprovalsStore((s) => s.sortBy)
  const sortOrder = useApprovalsStore((s) => s.sortOrder)

  return useAppQuery<ApprovalRequestsListResponse>({
    queryKey: approvalKeys.list({
      filters,
      pageIndex,
      pageSize,
      sortBy,
      sortOrder,
    }),
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams()

      // Pagination
      params.append('limit', pageSize.toString())
      params.append('offset', (pageIndex * pageSize).toString())

      // Sorting
      params.append('sortBy', sortBy)
      params.append('sortOrder', sortOrder)

      // Status filter (comma-separated for multi-select)
      if (filters.status.length > 0) {
        params.append('status', filters.status.join(','))
      }

      // User ID filter (comma-separated for multi-select)
      if (filters.userId.length > 0) {
        params.append('userId', filters.userId.join(','))
      }

      // Content type filter (comma-separated for multi-select)
      if (filters.contentType.length > 0) {
        params.append('contentType', filters.contentType.join(','))
      }

      // Triggered by filter (comma-separated for multi-select)
      if (filters.triggeredBy.length > 0) {
        params.append('triggeredBy', filters.triggeredBy.join(','))
      }

      // Search filter
      if (filters.search) {
        params.append('search', filters.search)
      }

      return apiClient.get(
        `/v1/approval/requests?${params}`,
        ApprovalRequestsListResponseSchema,
      )
    },
  })
}
