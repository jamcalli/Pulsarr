import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ListX } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createWatchlistExclusionColumns,
  type WatchlistExclusionTableRow,
} from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table-columns'
import { WatchlistExclusionsTableToolbar } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table-toolbar'
import type {
  useCreateWatchlistExclusion,
  useRemoveWatchlistExclusion,
} from '@/features/utilities/hooks/useWatchlistExclusionMutations'
import { useTablePagination } from '@/hooks/use-table-pagination'

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

interface WatchlistExclusionsTableProps {
  data: WatchlistExclusionTableRow[]
  userFilterOptions: Array<{ label: string; value: string }>
  isRefreshing: boolean
  onRefresh: () => void
  onExclude: (row: WatchlistExclusionTableRow) => void
  onUnexclude: (row: WatchlistExclusionTableRow) => void
  createMutation: ReturnType<typeof useCreateWatchlistExclusion>
  removeMutation: ReturnType<typeof useRemoveWatchlistExclusion>
}

export function WatchlistExclusionsTable({
  data,
  userFilterOptions,
  isRefreshing,
  onRefresh,
  onExclude,
  onUnexclude,
  createMutation,
  removeMutation,
}: WatchlistExclusionsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'added', desc: true },
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({ added: false })
  const { pageSize, setPageSize } = useTablePagination(
    'watchlist-exclusions',
    10,
  )

  const columns = createWatchlistExclusionColumns({
    onExclude,
    onUnexclude,
    createMutation,
    removeMutation,
  })

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    autoResetPageIndex: false,
    initialState: {
      pagination: {
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  React.useEffect(() => {
    table.setPageSize(pageSize)
  }, [pageSize, table])

  // Reset to first page when sorting or filters change, but not when row data
  // updates (so excluding/unexcluding keeps you on the current page)
  // biome-ignore lint/correctness/useExhaustiveDependencies: sorting and columnFilters are intentional re-run triggers
  React.useEffect(() => {
    table.setPageIndex(0)
  }, [sorting, columnFilters, table])

  return (
    <div className="w-full min-w-0 font-base text-main-foreground overflow-x-auto">
      <WatchlistExclusionsTableToolbar
        table={table}
        userFilterOptions={userFilterOptions}
        isFiltered={columnFilters.length > 0}
        onResetFilters={() => setColumnFilters([])}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
      />

      <div className="rounded-md">
        <Table>
          <TableHeader className="font-heading">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const headerClassName = `px-2 py-2 ${
                    (header.column.columnDef.meta as ColumnMetaType)
                      ?.headerClassName || ''
                  }`
                  return (
                    <TableHead key={header.id} className={headerClassName}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => {
                    const cellClassName = `px-2 py-2 ${
                      (cell.column.columnDef.meta as ColumnMetaType)
                        ?.className || ''
                    }`
                    return (
                      <TableCell key={cell.id} className={cellClassName}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {data.length === 0 ? (
                    <div className="py-8 text-foreground">
                      <ListX className="h-8 w-8 mx-auto mb-2 opacity-50 text-foreground" />
                      <p>No watchlist items found</p>
                      <p className="text-sm">
                        Watchlist items from configured users will appear here
                      </p>
                    </div>
                  ) : (
                    'No results.'
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2 pt-4">
        <div className="flex items-center space-x-2">
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              const newPageSize = Number(value)
              setPageSize(newPageSize)
              table.setPageSize(newPageSize)
            }}
          >
            <SelectTrigger className="h-8 w-17.5">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-foreground font-medium hidden xs:block">
            per page
          </p>
        </div>

        <div className="flex items-center justify-center text-sm font-medium text-foreground">
          {(() => {
            const filteredCount = table.getFilteredRowModel().rows.length
            const pageIndex = table.getState().pagination.pageIndex
            const currentPageSize = table.getState().pagination.pageSize
            const pageCount = table.getPageCount()
            const start = pageIndex * currentPageSize + 1
            const end = Math.min(
              (pageIndex + 1) * currentPageSize,
              filteredCount,
            )
            return (
              <>
                <span className="hidden sm:inline">
                  {filteredCount > 0
                    ? `Showing ${start}-${end} of ${filteredCount}`
                    : 'No results'}
                </span>
                <span className="sm:hidden">
                  {filteredCount > 0
                    ? `Page ${pageIndex + 1} of ${pageCount}`
                    : 'No results'}
                </span>
              </>
            )
          })()}
        </div>

        <div className="space-x-2">
          <Button
            variant="noShadow"
            size="sm"
            aria-label="Previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4 xs:hidden" />
            <span className="hidden xs:inline">Previous</span>
          </Button>
          <Button
            variant="noShadow"
            size="sm"
            aria-label="Next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4 xs:hidden" />
            <span className="hidden xs:inline">Next</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
