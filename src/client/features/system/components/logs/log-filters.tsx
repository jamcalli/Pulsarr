import { FilterToolbar } from '@/components/filter-toolbar'
import type { LogsPage } from '@/features/system/hooks/logs/useLogsPage'
import { LOG_FILTER_WIDTHS } from '@/features/system/lib/logs/log-layout'
import { LEVEL_FILTER_OPTIONS } from '@/features/system/lib/logs/log-levels'
import { toolbarFilter } from '@/lib/filter-toolbar'

export function LogFilters({ page }: { page: LogsPage }) {
  const { filters } = page
  const level = toolbarFilter({
    label: 'Level',
    value: filters.level,
    options: LEVEL_FILTER_OPTIONS,
    onValueChange: (next) => page.setFilters({ level: next }),
    width: LOG_FILTER_WIDTHS.level,
  })

  return (
    <FilterToolbar
      search={{
        label: 'Search lines',
        value: filters.q,
        onValueChange: (q) => page.setFilters({ q }),
      }}
      filters={[level]}
      filterCount={filters.level === null ? 0 : 1}
      filtered={page.filtered}
      onClear={page.clearFilters}
      total={page.shownEntries.length}
      noun="line"
    />
  )
}
