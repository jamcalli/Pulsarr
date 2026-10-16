import type { ReactNode } from 'react'
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import {
  COMPACT_LOG_COLUMN_CLASSES,
  COMPACT_LOG_COLUMNS,
  LOG_COLUMN_CLASSES,
  LOG_COLUMNS,
} from '@/features/system/components/logs/log-columns'

const MESSAGE_WIDTHS = [
  'w-3/5',
  'w-1/2',
  'w-4/5',
  'w-2/5',
  'w-3/5',
  'w-2/3',
  'w-1/3',
  'w-3/5',
  'w-4/5',
  'w-1/2',
  'w-2/3',
  'w-1/2',
  'w-3/4',
  'w-2/5',
  'w-3/5',
  'w-2/3',
  'w-2/5',
  'w-1/2',
  'w-3/5',
  'w-1/2',
  'w-3/4',
  'w-1/3',
  'w-3/5',
  'w-2/3',
] as const
const ROW_WIDTHS = new Map(
  MESSAGE_WIDTHS.map((width, index) => [`row-${index}`, width]),
)
const ROWS = [...ROW_WIDTHS.keys()]
const PHONE_ROWS = 13

function cellSkeleton(id: string, row: string): ReactNode {
  if (id === 'time') return <Skeleton className="h-4 w-16 md:w-24" />
  if (id === 'level') return <Skeleton className="h-6 w-12" />
  return <Skeleton className={`h-4 ${ROW_WIDTHS.get(row) ?? 'w-1/2'}`} />
}

export function LogTableSkeleton({
  compact,
  className,
}: {
  compact: boolean
  className: string
}) {
  return (
    <DataTableSkeleton
      columns={compact ? COMPACT_LOG_COLUMNS : LOG_COLUMNS}
      columnClasses={compact ? COMPACT_LOG_COLUMN_CLASSES : LOG_COLUMN_CLASSES}
      rows={compact ? ROWS.slice(0, PHONE_ROWS) : ROWS}
      cell={cellSkeleton}
      selectable={false}
      expandable
      variant="flat"
      className={className}
    />
  )
}
