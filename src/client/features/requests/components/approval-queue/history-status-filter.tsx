import { SegmentedControl } from '@/components/segmented-control'
import { Badge } from '@/components/ui/badge'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { HISTORY_STATUS_OPTIONS } from '@/features/requests/lib/approval-queue/queue-state'
import { formatNumber } from '@/lib/format'

/** Counts come from unfiltered stats, so they hide while any filter or search is set. */
export function HistoryStatusFilter({ page }: { page: ApprovalQueuePage }) {
  const counts = page.filtered ? null : page.stats

  return (
    <SegmentedControl
      aria-label="Status"
      value={page.state.status}
      onValueChange={(status) => page.update({ status })}
      options={HISTORY_STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label:
          counts && option.value !== 'all' ? (
            <>
              {option.label}
              <Badge variant="secondary">
                {formatNumber(counts[option.value])}
              </Badge>
            </>
          ) : (
            option.label
          ),
      }))}
    />
  )
}
