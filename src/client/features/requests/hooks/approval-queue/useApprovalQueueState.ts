import { useSearchParams } from 'react-router-dom'
import {
  parseQueueState,
  type QueueState,
  serializeQueueState,
} from '@/features/requests/lib/approval-queue/queue-state'

export function useApprovalQueueState() {
  const [searchParams, setSearchParams] = useSearchParams()
  const state = parseQueueState(searchParams)

  return {
    state,
    setState: (next: QueueState) =>
      setSearchParams(serializeQueueState(next), { replace: true }),
    pageHref: (page: number) => {
      const query = serializeQueueState({ ...state, page }).toString()
      return query ? `?${query}` : '?'
    },
  }
}
