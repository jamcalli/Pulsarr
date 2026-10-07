import { APPROVAL_REQUESTS_MAX_LIMIT } from '@root/schemas/approval/approval.schema'
import { keepPreviousData } from '@tanstack/react-query'
import { approvalsSortPref } from '@/features/home/lib/home-prefs'
import { useMinLoading } from '@/hooks/useMinLoading'
import { usePref } from '@/lib/prefs'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'
import type { components } from '@/types/api.js'

export type PendingApproval = components['schemas']['ApprovalRequest']

export const PENDING_APPROVALS_SHOWN = 4

export function usePendingApprovals() {
  const [sort, setSort] = usePref(approvalsSortPref)

  const query = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/approval/requests',
      {
        params: {
          query: {
            status: 'pending',
            limit: APPROVAL_REQUESTS_MAX_LIMIT,
            sortBy: 'createdAt',
            sortOrder: sort === 'oldest' ? 'asc' : 'desc',
          },
        },
      },
      { placeholderData: keepPreviousData },
    ),
  )

  return {
    sort,
    setSort,
    requests: query.data?.approvalRequests,
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Approvals failed to load.')
      : null,
  }
}
