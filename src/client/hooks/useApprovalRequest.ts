import { useMinLoading } from '@/hooks/useMinLoading'
import { $api, apiErrorMessage } from '@/lib/tanstackApi'

export function useApprovalRequest(id: number | null) {
  const query = useMinLoading(
    $api.useQuery(
      'get',
      '/v1/approval/requests/{id}',
      { params: { path: { id: id ?? -1 } } },
      { enabled: id !== null },
    ),
  )

  return {
    approval: query.data?.approvalRequest ?? null,
    isLoading: query.isLoading,
    errorMessage: query.isError
      ? (apiErrorMessage(query.error) ?? 'Request failed to load.')
      : null,
  }
}
