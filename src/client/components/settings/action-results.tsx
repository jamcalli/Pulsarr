import { cn } from 'cn'
import { CircleCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTime } from '@/lib/format'

export interface ActionResultStat {
  label: string
  value: number
  destructive?: boolean
}

export interface ActionResultRow {
  target: string
  stats: ActionResultStat[]
}

/** `rows` draws the per-target counts table, `children` replaces it for results that are not counts. */
type ActionResultsProps = { ranAt: number } & (
  | { rows: ActionResultRow[]; children?: never }
  | { rows?: never; children: ReactNode }
)

export interface ResultsColumn {
  label: string
  className?: string
}

export function ResultsTableHeader({ columns }: { columns: ResultsColumn[] }) {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        {columns.map(({ label, className }) => (
          <TableHead
            key={label}
            className={cn('font-normal text-muted-foreground', className)}
          >
            {label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  )
}

function visibleColumns(rows: ActionResultRow[]): string[] {
  const stats = rows.flatMap((row) => row.stats)
  const labels = [...new Set(stats.map((stat) => stat.label))]
  return labels.filter((label) => {
    const column = stats.filter((stat) => stat.label === label)
    const allDestructive = column.every((stat) => stat.destructive)
    return !allDestructive || column.some((stat) => stat.value > 0)
  })
}

function cellClass({ value, destructive }: ActionResultStat): string {
  if (value === 0) return 'text-muted-foreground'
  return destructive ? 'text-destructive font-bold' : 'text-foreground'
}

export function ActionResults({ ranAt, rows, children }: ActionResultsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <CircleCheck className="size-4 text-ok" aria-hidden />
        <span className="text-xs text-muted-foreground">
          Ran at {formatTime(ranAt)}
        </span>
      </div>
      {rows ? <CountsTable rows={rows} /> : children}
    </div>
  )
}

function CountsTable({ rows }: { rows: ActionResultRow[] }) {
  const columns = visibleColumns(rows)

  return (
    <Table className="text-xs">
      <ResultsTableHeader
        columns={[
          { label: 'Target' },
          ...columns.map((label) => ({ label, className: 'text-right' })),
        ]}
      />
      <TableBody>
        {rows.map(({ target, stats }) => (
          <TableRow key={target}>
            <TableCell className="font-medium">{target}</TableCell>
            {columns.map((label) => {
              const stat = stats.find((s) => s.label === label)
              if (!stat) return <TableCell key={label} />
              return (
                <TableCell
                  key={label}
                  className={cn('text-right tabular-nums', cellClass(stat))}
                >
                  {stat.value}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
