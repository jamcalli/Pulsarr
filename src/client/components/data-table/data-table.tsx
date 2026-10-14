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
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import { Fragment, type ReactNode, useId, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
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
const EXPAND_CLASS = 'w-px pr-4'
const NO_SELECTION: RowSelectionState = {}

/** A row either opens elsewhere on click or expands its own detail below it, never both. */
type RowActionProps<TData> =
  | {
      onRowClick?: (row: TData) => void
      renderExpanded?: never
      expandedLabel?: never
      expandedId?: never
      onExpandedChange?: never
    }
  | {
      onRowClick?: never
      renderExpanded: (row: TData) => ReactNode
      /** Names the detail region and its toggle. */
      expandedLabel: (row: TData) => string
      expandedId: string | null
      onExpandedChange: (id: string | null) => void
    }

/** Rows are selectable only when the caller owns a selection. */
type SelectionProps<TData> =
  | {
      rowSelection: RowSelectionState
      onRowSelectionChange: (next: RowSelectionState) => void
      /** Names a row in its checkbox label ("Select {name}"). */
      rowName: (row: TData) => string
    }
  | {
      rowSelection?: never
      onRowSelectionChange?: never
      rowName?: never
    }

type DataTableProps<TData> = RowActionProps<TData> &
  SelectionProps<TData> & {
    label: string
    /** Must be referentially stable, since a new cell renderer remounts its cells. */
    columns: ColumnDef<TData>[]
    /** Cell and header classes by column id, such as widths and wrapping. */
    columnClasses?: Partial<Record<string, string>>
    data: TData[]
    getRowId: (row: TData) => string
    sorting: SortingState
    onSortingChange: (next: SortingState) => void
    /** Shows the rows without letting them be selected or opened, such as while the next page loads. */
    frozen?: boolean
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
export function DataTable<TData>(props: DataTableProps<TData>) {
  const {
    label,
    columns,
    columnClasses = {},
    data,
    getRowId,
    sorting,
    onSortingChange,
    onRowClick,
    frozen = false,
  } = props
  const expansion = props.renderExpanded ? props : null
  const selection = props.rowSelection ? props : null
  const detailIdPrefix = useId()
  const selectable = selection !== null
  const allColumns = useMemo<ColumnDef<TData>[]>(
    () =>
      selectable
        ? [{ id: SELECT_ID, enableSorting: false }, ...columns]
        : columns,
    [columns, selectable],
  )
  const rowSelection = selection?.rowSelection ?? NO_SELECTION

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
    enableRowSelection: selectable,
    state: { sorting, rowSelection },
    onSortingChange: (updater) =>
      onSortingChange(functionalUpdate(updater, sorting)),
    onRowSelectionChange: (updater) =>
      selection?.onRowSelectionChange(functionalUpdate(updater, rowSelection)),
  })
  const classFor = (id: string) =>
    id === SELECT_ID ? SELECT_CLASS : columnClasses[id]

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table
        aria-label={label}
        aria-busy={frozen || undefined}
        className={cn('transition-opacity', frozen && 'opacity-60')}
      >
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
                      disabled={frozen}
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
              {expansion && <TableHead className={EXPAND_CLASS} />}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const open = expansion?.expandedId === row.id
            const detailId = `${detailIdPrefix}-${row.id}`
            const toggle =
              expansion &&
              (() => expansion.onExpandedChange(open ? null : row.id))
            const click = onRowClick && (() => onRowClick(row.original))
            const onActivate = frozen ? undefined : (toggle ?? click)

            return (
              <Fragment key={row.id}>
                <TableRow
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(onActivate && 'cursor-pointer')}
                  onClick={onActivate}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn('py-2 last:pr-4', classFor(cell.column.id))}
                    >
                      {cell.column.id === SELECT_ID && selection ? (
                        <Checkbox
                          aria-label={`Select ${selection.rowName(row.original)}`}
                          disabled={frozen}
                          checked={row.getIsSelected()}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) =>
                            row.toggleSelected(checked)
                          }
                        />
                      ) : (
                        flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )
                      )}
                    </TableCell>
                  ))}
                  {expansion && (
                    <TableCell className={cn('py-2', EXPAND_CLASS)}>
                      <button
                        type="button"
                        aria-label={expansion.expandedLabel(row.original)}
                        aria-expanded={open}
                        aria-controls={open ? detailId : undefined}
                        disabled={frozen}
                        className="flex rounded-sm text-muted-foreground outline-foreground/50 focus-visible:outline-3 focus-visible:outline-offset-0"
                      >
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'size-4 transition-transform',
                            open && 'rotate-180',
                          )}
                        />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
                {expansion && open && (
                  <TableRow className="bg-accent/50 hover:bg-accent/50">
                    <TableCell
                      colSpan={row.getVisibleCells().length + 1}
                      className="p-0"
                    >
                      <section
                        id={detailId}
                        aria-label={expansion.expandedLabel(row.original)}
                        className="sticky left-0 w-(--scroll-fade-width) p-4 whitespace-normal"
                      >
                        {expansion.renderExpanded(row.original)}
                      </section>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}

export function DataTableSelectSkeleton() {
  return (
    <TableCell className={cn('py-2', SELECT_CLASS)}>
      <Skeleton className="size-5" />
    </TableCell>
  )
}

export function DataTableExpandSkeleton() {
  return (
    <TableCell className={cn('py-2', EXPAND_CLASS)}>
      <Skeleton className="size-4" />
    </TableCell>
  )
}
