import { keepPreviousData } from '@tanstack/react-query'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'
import { $api } from '@/lib/tanstackApi'
import { useMinLoading } from '@/lib/useMinLoading'

/**
 * Key prefix covering every params variant of the approval requests query.
 */
export const approvalKeys = {
  all: $api.queryOptions('get', '/v1/approval/requests').queryKey,
}

/**
 * Fetches approval requests with server-side pagination and filtering.
 * Reads filter and pagination params from the approvals store so all
 * consumers share the same query and data.
 *
 * Multi-select filters are sent comma-separated per the API contract.
 */
export function useApprovals() {
  const filters = useApprovalsStore((s) => s.filters)
  const pageIndex = useApprovalsStore((s) => s.pageIndex)
  const pageSize = useApprovalsStore((s) => s.pageSize)
  const sortBy = useApprovalsStore((s) => s.sortBy)
  const sortOrder = useApprovalsStore((s) => s.sortOrder)

  return useMinLoading(
    $api.useQuery(
      'get',
      '/v1/approval/requests',
      {
        params: {
          query: {
            limit: pageSize,
            offset: pageIndex * pageSize,
            sortBy,
            sortOrder,
            ...(filters.status.length > 0
              ? { status: filters.status.join(',') }
              : {}),
            ...(filters.userId.length > 0
              ? { userId: filters.userId.join(',') }
              : {}),
            ...(filters.contentType.length > 0
              ? { contentType: filters.contentType.join(',') }
              : {}),
            ...(filters.triggeredBy.length > 0
              ? { triggeredBy: filters.triggeredBy.join(',') }
              : {}),
            ...(filters.search ? { search: filters.search } : {}),
          },
        },
      },
      { placeholderData: keepPreviousData },
    ),
  )
}
