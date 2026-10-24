import { FilterToolbar } from '@/components/filter-toolbar'
import type { SessionMonitoringPage } from '@/features/library/hooks/session-monitoring/useSessionMonitoringPage'
import { ROLLING_MODE_OPTIONS } from '@/features/library/lib/session-monitoring/rolling-labels'
import {
  SHOWS_FILTER_WIDTHS,
  STATUS_FILTER_OPTIONS,
} from '@/features/library/lib/session-monitoring/shows-state'
import { toolbarFilter } from '@/lib/filter-toolbar'

export function RollingShowsFilters({ page }: { page: SessionMonitoringPage }) {
  const { state } = page
  const filters = [
    toolbarFilter({
      label: 'Mode',
      value: state.mode,
      options: ROLLING_MODE_OPTIONS,
      onValueChange: (mode) => page.update({ mode }),
      width: SHOWS_FILTER_WIDTHS.mode,
    }),
    toolbarFilter({
      label: 'Status',
      value: state.status,
      options: STATUS_FILTER_OPTIONS,
      onValueChange: (status) => page.update({ status }),
      width: SHOWS_FILTER_WIDTHS.status,
    }),
  ]

  return (
    <FilterToolbar
      search={{
        label: 'Search by title',
        value: state.q,
        onValueChange: (q) => page.update({ q }),
      }}
      filters={filters}
      filterCount={page.filterCount}
      filtered={page.filtered}
      onClear={page.clearFilters}
      total={page.total}
      noun="show"
    />
  )
}
