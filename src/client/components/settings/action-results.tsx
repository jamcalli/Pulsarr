import { cn } from 'cn'
import { CircleCheck } from 'lucide-react'
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
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-divider text-muted-foreground">
            <th className="pb-1 text-left font-normal">Target</th>
            {columns.map((label) => (
              <th key={label} className="pb-1 text-right font-normal">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ target, stats }) => (
            <tr key={target}>
              <td className="py-1 font-medium">{target}</td>
              {columns.map((label) => {
                const stat = stats.find((s) => s.label === label)
                return (
                  stat && (
                    <td
                      key={label}
                      className={cn(
                        'py-1 text-right tabular-nums',
                        cellClass(stat),
                      )}
                    >
                      {stat.value}
                    </td>
                  )
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
