import type { ColumnDef } from '@tanstack/react-table'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import { DataTableSelectSkeleton } from '@/components/data-table/data-table'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DataTableSkeletonProps<TData> {
  columns: ColumnDef<TData>[]
  columnClasses?: Partial<Record<string, string>>
  /** One key per placeholder row, passed to `cell` so rows can vary their widths. */
  rows: readonly string[]
  cell: (columnId: string, row: string) => ReactNode
}

export function DataTableSkeleton<TData>({
  columns,
  columnClasses = {},
  rows,
  cell,
}: DataTableSkeletonProps<TData>) {
  const headers = columns.map((column) => ({
    id: column.id ?? '',
    label: typeof column.header === 'string' ? column.header : null,
    className: column.id ? columnClasses[column.id] : undefined,
  }))

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-px pl-4" />
            {headers.map((header) => (
              <TableHead
                key={header.id}
                className={cn('last:pr-4', header.className)}
              >
                {header.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row} className="hover:bg-transparent">
              <DataTableSelectSkeleton />
              {headers.map((header) => (
                <TableCell
                  key={header.id}
                  className={cn('py-2 last:pr-4', header.className)}
                >
                  {cell(header.id, row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
