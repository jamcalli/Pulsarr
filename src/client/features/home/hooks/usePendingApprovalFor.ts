import type { MediaItem } from '@/features/home/lib/media-item'
import { useApprovalRequest } from '@/hooks/useApprovalRequest'
import { $api } from '@/lib/tanstackApi'

const LOOKUP_LIMIT = 10

/** Approval-source requests carry their own id, and items with no request are looked up by exact title and type. */
export function usePendingApprovalFor(item: MediaItem) {
  const knownId = item.request?.source === 'approval' ? item.request.id : null
  const lookup = $api.useQuery(
    'get',
    '/v1/approval/requests',
    {
      params: {
        query: {
          status: 'pending',
          contentType: item.type,
          search: item.title,
          limit: LOOKUP_LIMIT,
        },
      },
    },
    { enabled: !item.request },
  )
  const match = lookup.data?.approvalRequests.find(
    (candidate) =>
      candidate.contentTitle === item.title &&
      candidate.contentType === item.type,
  )
  const approvalId = knownId ?? match?.id ?? null
  const { approval, errorMessage } = useApprovalRequest(approvalId)

  return { approvalId, approval, errorMessage }
}
