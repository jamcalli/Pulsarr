import { StickyActionBar } from '@/components/sticky-action-bar'
import { Button } from '@/components/ui/button'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { formatCount } from '@/lib/format'

export function ApprovalQueueBar({ page }: { page: ApprovalQueuePage }) {
  const count = page.selected.length
  if (count === 0) return null
  const approveLabel =
    page.state.tab === 'history'
      ? `Approve ${formatCount(count, 'request')}`
      : 'Approve'

  return (
    <StickyActionBar
      mode="selection"
      count={count}
      onClearSelection={page.clearSelection}
      errorMessage={page.failure?.message}
      errorDetail={page.failure?.detail}
    >
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => page.openConfirm('delete')}
      >
        Delete
      </Button>
      {page.canDeny && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => page.openConfirm('deny')}
        >
          Deny
        </Button>
      )}
      {page.canApprove && (
        <Button
          type="button"
          size="sm"
          onClick={() => page.openConfirm('approve')}
        >
          {approveLabel}
        </Button>
      )}
    </StickyActionBar>
  )
}
