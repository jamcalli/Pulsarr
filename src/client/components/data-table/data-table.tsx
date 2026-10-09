import {
  type ColumnDef,
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  type Header,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { cn } from 'cn'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const SELECT_ID = 'select'
const SELECT_CLASS = 'w-px pl-4'

interface DataTableProps<TData> {
  label: string
  /** Must be referentially stable, since a new cell renderer remounts its cells. */
  columns: ColumnDef<TData>[]
  /** Cell and header classes by column id, such as widths and wrapping. */
  columnClasses?: Partial<Record<string, string>>
  data: TData[]
  getRowId: (row: TData) => string
  /** Names a row in its checkbox label ("Select {name}"). */
  rowName: (row: TData) => string
  sorting: SortingState
  onSortingChange: (next: SortingState) => void
  rowSelection: RowSelectionState
  onRowSelectionChange: (next: RowSelectionState) => void
  onRowClick?: (row: TData) => void
}

function SortHeader<TData>({ header }: { header: Header<TData, unknown> }) {
  const label = flexRender(header.column.columnDef.header, header.getContext())
  if (!header.column.getCanSort()) return label
  const sorted = header.column.getIsSorted()
  const Arrow = sorted === 'asc' ? ArrowUp : ArrowDown

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 px-2 text-sm font-medium text-foreground"
      onClick={header.column.getToggleSortingHandler()}
    >
      {label}
      {sorted && <Arrow className="text-muted-foreground" aria-hidden />}
    </Button>
  )
}

function ariaSort(sorted: false | 'asc' | 'desc') {
  if (sorted === 'asc') return 'ascending'
  if (sorted === 'desc') return 'descending'
  return undefined
}

/** Server-driven table: the caller owns sorting, selection and paging, and `data` is already the current page. */
export function DataTable<TData>({
  label,
  columns,
  columnClasses = {},
  data,
  getRowId,
  rowName,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
}: DataTableProps<TData>) {
  const allColumns = useMemo<ColumnDef<TData>[]>(
    () => [{ id: SELECT_ID, enableSorting: false }, ...columns],
    [columns],
  )

  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
    state: { sorting, rowSelection },
    onSortingChange: (updater) =>
      onSortingChange(functionalUpdate(updater, sorting)),
    onRowSelectionChange: (updater) =>
      onRowSelectionChange(functionalUpdate(updater, rowSelection)),
  })
  const classFor = (id: string) =>
    id === SELECT_ID ? SELECT_CLASS : columnClasses[id]

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table aria-label={label}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  aria-sort={ariaSort(header.column.getIsSorted())}
                  className={cn('last:pr-4', classFor(header.column.id))}
                >
                  {header.column.id === SELECT_ID ? (
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={table.getIsAllPageRowsSelected()}
                      indeterminate={table.getIsSomePageRowsSelected()}
                      onCheckedChange={() =>
                        table.toggleAllPageRowsSelected(
                          !table.getIsAllPageRowsSelected(),
                        )
                      }
                    />
                  ) : (
                    <SortHeader header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? 'selected' : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn('py-2 last:pr-4', classFor(cell.column.id))}
                >
                  {cell.column.id === SELECT_ID ? (
                    <Checkbox
                      aria-label={`Select ${rowName(row.original)}`}
                      checked={row.getIsSelected()}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={(checked) => row.toggleSelected(checked)}
                    />
                  ) : (
                    flexRender(cell.column.columnDef.cell, cell.getContext())
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
