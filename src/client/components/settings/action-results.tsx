import { cn } from 'cn'
import { CircleCheck } from 'lucide-react'
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

interface ActionResultsProps {
  ranAt: number
  rows: ActionResultRow[]
}

const HEAD_CLASS = 'font-normal text-muted-foreground'

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

export function ActionResults({ ranAt, rows }: ActionResultsProps) {
  const columns = visibleColumns(rows)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <CircleCheck className="size-4 text-ok" aria-hidden />
        <span className="text-xs text-muted-foreground">
          Ran at {formatTime(ranAt)}
        </span>
      </div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD_CLASS}>Target</TableHead>
            {columns.map((label) => (
              <TableHead key={label} className={cn(HEAD_CLASS, 'text-right')}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
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
    </div>
  )
}
