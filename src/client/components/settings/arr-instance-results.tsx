import { ResultsTableHeader } from '@/components/settings/action-results'
import { StatusPill, type StatusTone } from '@/components/status-pill'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import { ARR_TYPE_LABELS } from '@/lib/arr-labels'

export interface ArrInstanceResultRow {
  key: string
  type: keyof typeof ARR_TYPE_LABELS
  name: string
  pill: { tone: StatusTone; label: string }
  /** Shown under the name, such as the reason a row failed. */
  message: string | null
}

interface ArrInstanceResultsTableProps {
  rows: readonly ArrInstanceResultRow[]
  caption: string
  statusLabel: string
}

const COLUMNS = (statusLabel: string) => [
  { label: 'Instance' },
  { label: 'Type', className: 'max-md:hidden' },
  { label: statusLabel, className: 'text-right' },
]

export function ArrInstanceResultsTable({
  rows,
  caption,
  statusLabel,
}: ArrInstanceResultsTableProps) {
  return (
    <Table className="text-xs">
      <TableCaption className="sr-only">{caption}</TableCaption>
      <ResultsTableHeader columns={COLUMNS(statusLabel)} />
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground md:hidden">
                  {ARR_TYPE_LABELS[row.type]}
                </span>
                {row.message && (
                  <span className="text-muted-foreground">{row.message}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="align-top max-md:hidden">
              {ARR_TYPE_LABELS[row.type]}
            </TableCell>
            <TableCell className="text-right align-top">
              <StatusPill tone={row.pill.tone} label={row.pill.label} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ArrInstanceResultsSkeleton({
  rows,
  statusLabel,
}: {
  rows: readonly string[]
  statusLabel: string
}) {
  return (
    <Table className="text-xs">
      <ResultsTableHeader columns={COLUMNS(statusLabel)} />
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row} className="hover:bg-transparent">
            <TableCell>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell className="max-md:hidden">
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="ml-auto h-5 w-20" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
