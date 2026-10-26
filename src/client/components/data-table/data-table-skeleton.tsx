import type { ColumnDef } from '@tanstack/react-table'
import { cn } from 'cn'
import type { ReactNode } from 'react'
import {
  DataTableExpandSkeleton,
  DataTableFrame,
  DataTableSelectSkeleton,
} from '@/components/data-table/data-table'
import {
  DATA_TABLE_EDGES,
  type DataTableVariant,
} from '@/components/data-table/data-table-variant'
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
  /** Adds the trailing toggle column of a table with `renderExpanded`. */
  expandable?: boolean
  /** Drops the leading checkbox column of a table without a selection. */
  selectable?: boolean
  variant?: DataTableVariant
  className?: string
}

export function DataTableSkeleton<TData>({
  columns,
  columnClasses = {},
  rows,
  cell,
  expandable = false,
  selectable = true,
  variant = 'framed',
  className,
}: DataTableSkeletonProps<TData>) {
  const edges = DATA_TABLE_EDGES[variant]
  const headers = columns.map((column) => ({
    id: column.id ?? '',
    label: typeof column.header === 'string' ? column.header : null,
    className: column.id ? columnClasses[column.id] : undefined,
  }))

  return (
    <DataTableFrame variant={variant} className={className}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable && <TableHead className={edges.select} />}
            {headers.map((header) => (
              <TableHead
                key={header.id}
                className={cn(edges.last, header.className)}
              >
                {header.label}
              </TableHead>
            ))}
            {expandable && (
              <TableHead className={cn(edges.expand, columnClasses.expand)} />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row} className="hover:bg-transparent">
              {selectable && <DataTableSelectSkeleton variant={variant} />}
              {headers.map((header) => (
                <TableCell
                  key={header.id}
                  className={cn('py-2', edges.last, header.className)}
                >
                  {cell(header.id, row)}
                </TableCell>
              ))}
              {expandable && (
                <DataTableExpandSkeleton
                  variant={variant}
                  className={columnClasses.expand}
                />
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableFrame>
  )
}
