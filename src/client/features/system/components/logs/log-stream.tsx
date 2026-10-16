import type { SortingState } from '@tanstack/react-table'
import { ScrollText } from 'lucide-react'
import { DataTable } from '@/components/data-table/data-table'
import { EmptyState } from '@/components/empty-state'
import { NoMatchesEmpty } from '@/components/no-matches-empty'
import {
  COMPACT_LOG_COLUMN_CLASSES,
  COMPACT_LOG_COLUMNS,
  LOG_COLUMN_CLASSES,
  LOG_COLUMNS,
} from '@/features/system/components/logs/log-columns'
import { LogDetail } from '@/features/system/components/logs/log-detail'
import { LogTableSkeleton } from '@/features/system/components/logs/log-table-skeleton'
import type { LogsPage } from '@/features/system/hooks/logs/useLogsPage'
import { lineData } from '@/features/system/lib/logs/log-buffer'
import {
  emptyStreamText,
  expandedLabel,
  JUMP_LABEL,
} from '@/features/system/lib/logs/log-copy'
import { SearchNeedleContext } from '@/features/system/lib/logs/log-filter'
import { STREAM_HEIGHT } from '@/features/system/lib/logs/log-layout'
import { useIsMobile } from '@/hooks/useIsMobile'

const NO_SORTING: SortingState = []

interface LogStreamProps {
  page: LogsPage
  silent: boolean
}

export function LogStream({ page, silent }: LogStreamProps) {
  const compact = useIsMobile()
  const { stream, total } = page
  const { kind } = stream.status

  if (total === 0 && (kind === 'connecting' || kind === 'retrying')) {
    return <LogTableSkeleton compact={compact} className={STREAM_HEIGHT} />
  }
  if (total === 0 && kind === 'failed') return null
  if (total === 0) {
    const text = emptyStreamText({
      cleared: stream.cleared,
      waitingOnly: stream.initialLines === 0,
      silent,
    })
    return (
      <EmptyState
        icon={<ScrollText />}
        title={text.title}
        description={text.description}
        className={STREAM_HEIGHT}
      />
    )
  }
  if (page.shownEntries.length === 0) {
    return (
      <NoMatchesEmpty
        title="No lines match these filters"
        description="Try another search, or clear the filters."
        onClear={page.clearFilters}
        className={STREAM_HEIGHT}
      />
    )
  }
  return (
    <SearchNeedleContext.Provider value={page.needle}>
      <DataTable
        label="Log lines"
        columns={compact ? COMPACT_LOG_COLUMNS : LOG_COLUMNS}
        columnClasses={
          compact ? COMPACT_LOG_COLUMN_CLASSES : LOG_COLUMN_CLASSES
        }
        variant="flat"
        data={page.shown}
        getRowId={(row) => row.id}
        sorting={NO_SORTING}
        onSortingChange={() => undefined}
        canExpand={(row) => lineData(row) !== null}
        renderExpanded={(row) => {
          const data = lineData(row)
          return (
            row.kind === 'line' &&
            data && <LogDetail entry={row.entry} data={data} />
          )
        }}
        expandedLabel={(row) =>
          row.kind === 'line' ? expandedLabel(row.entry) : ''
        }
        expandedId={page.expandedId}
        onExpandedChange={page.setExpandedId}
        scroll={{
          ref: page.scrollRef,
          className: STREAM_HEIGHT,
          bottomAction: { label: JUMP_LABEL, onClick: page.follow.follow },
        }}
      />
    </SearchNeedleContext.Provider>
  )
}
