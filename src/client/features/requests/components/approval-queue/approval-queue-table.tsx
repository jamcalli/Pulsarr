import { DataTable } from '@/components/data-table/data-table'
import {
  QUEUE_COLUMN_CLASSES,
  queueColumns,
} from '@/features/requests/components/approval-queue/approval-queue-columns'
import type { ApprovalQueuePage } from '@/features/requests/hooks/approval-queue/useApprovalQueuePage'
import { expiryLine } from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

interface ApprovalQueueTableProps {
  page: ApprovalQueuePage
  rows: ApprovalRequest[]
}

export function ApprovalQueueTable({ page, rows }: ApprovalQueueTableProps) {
  const { tab, sort, dir } = page.state
  const now = Date.now()
  const showExpires = rows.some((row) => expiryLine(row, now) !== null)

  return (
    <DataTable
      label={tab === 'history' ? 'Decided requests' : 'Pending requests'}
      columns={queueColumns(tab, showExpires)}
      columnClasses={QUEUE_COLUMN_CLASSES}
      data={rows}
      getRowId={(row) => String(row.id)}
      rowName={(row) => row.contentTitle}
      sorting={[{ id: sort, desc: dir === 'desc' }]}
      onSortingChange={(next) => {
        const [first] = next
        const key = page.sortKeys.find((option) => option === first?.id)
        if (first && key)
          page.update({ sort: key, dir: first.desc ? 'desc' : 'asc' })
      }}
      rowSelection={page.selection}
      onRowSelectionChange={page.setSelection}
      onRowClick={(row) => page.openReview(row.id)}
    />
  )
}
