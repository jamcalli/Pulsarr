import type { ColumnDef } from '@tanstack/react-table'
import { useContext } from 'react'
import { Badge } from '@/components/ui/badge'
import { Highlight } from '@/features/system/components/logs/highlight'
import type { LogRow } from '@/features/system/lib/logs/log-buffer'
import { gapText } from '@/features/system/lib/logs/log-copy'
import { SearchNeedleContext } from '@/features/system/lib/logs/log-filter'
import {
  LEVEL_BADGE_VARIANTS,
  LOG_LEVEL_LABELS,
} from '@/features/system/lib/logs/log-levels'
import { formatLogTime } from '@/lib/format'

const LINE_TEXT = 'font-mono text-xs leading-6 md:text-sm'

function MessageCell({ row, compact }: { row: LogRow; compact: boolean }) {
  const needle = useContext(SearchNeedleContext)
  if (row.kind === 'gap') {
    return (
      <span className="text-xs leading-6 text-muted-foreground">
        {gapText(row.from, row.to)}
      </span>
    )
  }
  const { module, message } = row.entry
  return (
    <span className={LINE_TEXT}>
      {module && !compact && (
        <span className="text-muted-foreground">
          <Highlight text={module} needle={needle} />{' '}
        </span>
      )}
      <Highlight text={message} needle={needle} />
    </span>
  )
}

function logColumns(compact: boolean): ColumnDef<LogRow>[] {
  return [
    {
      id: 'time',
      header: 'Time',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.kind === 'line' && (
          <span className={LINE_TEXT}>
            {formatLogTime(new Date(row.original.entry.timestamp), !compact)}
          </span>
        ),
    },
    {
      id: 'level',
      header: 'Level',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.kind === 'line' && (
          <Badge variant={LEVEL_BADGE_VARIANTS[row.original.entry.level]}>
            {LOG_LEVEL_LABELS[row.original.entry.level].label}
          </Badge>
        ),
    },
    {
      id: 'message',
      header: 'Message',
      enableSorting: false,
      cell: ({ row }) => <MessageCell row={row.original} compact={compact} />,
    },
  ]
}

export const LOG_COLUMNS = logColumns(false)

/** Drops the milliseconds and the module prefix for phones. */
export const COMPACT_LOG_COLUMNS = logColumns(true)

export const LOG_COLUMN_CLASSES: Partial<Record<string, string>> = {
  time: 'w-px py-0.5',
  level: 'w-18 py-0.5',
  message: 'py-0.5 whitespace-normal wrap-anywhere',
  expand: 'py-0.5',
}

export const COMPACT_LOG_COLUMN_CLASSES: Partial<Record<string, string>> = {
  time: 'w-px pr-1 py-0.5',
  level: 'w-15 px-1 py-0.5',
  message: 'px-1 py-0.5 whitespace-normal wrap-anywhere',
  expand: 'py-0.5 pr-2 pl-1',
}
