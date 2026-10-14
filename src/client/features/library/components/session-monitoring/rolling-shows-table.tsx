import { DataTable } from '@/components/data-table/data-table'
import { RollingShowDetail } from '@/features/library/components/session-monitoring/rolling-show-detail'
import {
  SHOWS_COLUMN_CLASSES,
  SHOWS_COLUMNS,
} from '@/features/library/components/session-monitoring/rolling-shows-columns'
import type { SessionMonitoringPage } from '@/features/library/hooks/session-monitoring/useSessionMonitoringPage'
import type { RollingShowRow } from '@/features/library/lib/session-monitoring/rolling-shows'

interface RollingShowsTableProps {
  page: SessionMonitoringPage
  rows: RollingShowRow[]
}

export function RollingShowsTable({ page, rows }: RollingShowsTableProps) {
  const { sort, dir } = page.state

  return (
    <DataTable
      label="Rolling shows"
      columns={SHOWS_COLUMNS}
      columnClasses={SHOWS_COLUMN_CLASSES}
      data={rows}
      getRowId={(row) => String(row.record.id)}
      sorting={[{ id: sort, desc: dir === 'desc' }]}
      onSortingChange={(next) => {
        const [first] = next
        const key = page.sortKeys.find((option) => option === first?.id)
        if (first && key)
          page.update({ sort: key, dir: first.desc ? 'desc' : 'asc' })
      }}
      renderExpanded={(row) => (
        <RollingShowDetail
          row={row}
          onStop={() => page.openConfirm({ kind: 'stop', row })}
          onReset={() => page.openConfirm({ kind: 'reset', row })}
        />
      )}
      expandedLabel={(row) => `${row.record.show_title} viewers`}
      expandedId={page.expandedId}
      onExpandedChange={page.setExpandedId}
    />
  )
}
