import { FilterToolbar } from '@/components/filter-toolbar'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import {
  filterCount,
  QUEUE_FILTER_WIDTHS,
  TRIGGER_FILTER_OPTIONS,
} from '@/features/requests/lib/approval-queue/queue-state'
import { useUserOptions } from '@/hooks/useUserOptions'
import { CONTENT_TYPE_FILTER_OPTIONS } from '@/lib/content-type'
import { toolbarFilter } from '@/lib/filter-toolbar'

export function ApprovalQueueFilters({ page }: { page: ApprovalQueuePage }) {
  const requesters = useUserOptions()
  const { state } = page
  const filters = [
    toolbarFilter({
      label: 'Requested by',
      value: state.user,
      options: requesters,
      onValueChange: (user) => page.update({ user }),
      width: QUEUE_FILTER_WIDTHS.user,
    }),
    toolbarFilter({
      label: 'Content type',
      value: state.type,
      options: CONTENT_TYPE_FILTER_OPTIONS,
      onValueChange: (type) => page.update({ type }),
      width: QUEUE_FILTER_WIDTHS.type,
    }),
    toolbarFilter({
      label: 'Trigger',
      value: state.trigger,
      options: TRIGGER_FILTER_OPTIONS,
      onValueChange: (trigger) => page.update({ trigger }),
      width: QUEUE_FILTER_WIDTHS.trigger,
    }),
  ]

  return (
    <FilterToolbar
      search={{
        label: 'Search titles',
        value: state.q,
        onValueChange: (q) => page.update({ q }),
      }}
      filters={filters}
      filterCount={filterCount(state)}
      filtered={page.filtered}
      onClear={page.clearFilters}
      total={page.total}
      noun="request"
    />
  )
}
