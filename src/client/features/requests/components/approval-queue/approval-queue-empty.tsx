import { History, Inbox, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { HISTORY_STATUS_OPTIONS } from '@/features/requests/lib/approval-queue/queue-state'

export function ApprovalQueueEmpty({ page }: { page: ApprovalQueuePage }) {
  const { tab, status } = page.state

  if (page.filtered) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="No requests match these filters"
        description="Try another search, or clear the filters to see everything."
      >
        <Button type="button" variant="outline" onClick={page.clearFilters}>
          Clear filters
        </Button>
      </EmptyState>
    )
  }
  if (tab === 'pending') {
    return (
      <EmptyState
        icon={<Inbox />}
        title="All caught up"
        description="Requests that need a decision will land here."
      />
    )
  }
  if (status === 'all') {
    return (
      <EmptyState
        icon={<History />}
        title="No history yet"
        description="Requests show up here once they are approved, denied or expire."
      />
    )
  }
  const label =
    HISTORY_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    ''
  return (
    <EmptyState
      icon={<History />}
      title={`No ${label.toLowerCase()} requests`}
      description="Try another status."
    />
  )
}
