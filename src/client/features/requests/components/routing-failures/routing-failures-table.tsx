import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  type Table as TanstackTable,
  useReactTable,
} from '@tanstack/react-table'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'
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
  createRoutingFailureColumns,
  type RoutingFailureRow,
} from '@/features/requests/components/routing-failures/routing-failures-table-columns'
import { RoutingFailuresTableToolbar } from '@/features/requests/components/routing-failures/routing-failures-table-toolbar'
import { useTablePagination } from '@/hooks/useTablePagination'
import { type PrefDef, readPref, writePref } from '@/lib/prefs'

const DEFAULT_SORTING = [{ id: 'last_failed_at', desc: true }]

const persistedStateSchema = z.object({
  sorting: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .catch(DEFAULT_SORTING),
  filters: z
    .array(
      z.union([
        z.object({ id: z.literal('title'), value: z.string() }),
        z.object({
          id: z.literal('userId'),
          value: z.array(z.string()).min(1),
        }),
        z.object({
          id: z.literal('category'),
          value: z.array(z.string()).min(1),
        }),
      ]),
    )
    .catch([]),
})

const tablePrefsDef: PrefDef<z.infer<typeof persistedStateSchema>> = {
  key: 'pulsarr-routing-failures-table',
  fallback: {
    sorting: DEFAULT_SORTING,
    filters: [],
  },
  parse: (raw) => {
    try {
      const result = persistedStateSchema.safeParse(JSON.parse(raw))
      return result.success ? result.data : undefined
    } catch {
      return undefined
    }
  },
  serialize: JSON.stringify,
}

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

/** The single value of a faceted filter, which the retry-all filters can express. */
function singleFilterValue(
  filters: ColumnFiltersState,
  id: string,
): string | undefined {
  const value = filters.find((filter) => filter.id === id)?.value
  return Array.isArray(value) && value.length === 1 ? value[0] : undefined
}

export interface RetryAllScope {
  userId?: number
  category?: string
}

interface RoutingFailuresTableProps {
  data: RoutingFailureRow[]
  userFilterOptions: Array<{ label: string; value: string }>
  initialUserId?: string
  isRefreshing: boolean
  onRefresh: () => void
  onRetry: (row: RoutingFailureRow) => void
  retryingItemId: number | null
  onRetryAll: (scope: RetryAllScope) => void
  isRetryingAll: boolean
}

function PaginationFooter({
  table,
  setPageSize,
}: {
  table: TanstackTable<RoutingFailureRow>
  setPageSize: (size: number) => void
}) {
  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.getState().pagination
  const start = pageIndex * pageSize + 1
  const end = Math.min((pageIndex + 1) * pageSize, filteredCount)

  return (
    <div className="flex items-center justify-between px-2 pt-4">
      <div className="flex items-center space-x-2">
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => {
            const newPageSize = Number(value)
            setPageSize(newPageSize)
            table.setPageSize(newPageSize)
          }}
        >
          <SelectTrigger className="h-8 w-17.5">
            <SelectValue placeholder={pageSize} />
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
        <span className="hidden sm:inline">
          {filteredCount > 0
            ? `Showing ${start}-${end} of ${filteredCount}`
            : 'No results'}
        </span>
        <span className="sm:hidden">
          {filteredCount > 0
            ? `Page ${pageIndex + 1} of ${table.getPageCount()}`
            : 'No results'}
        </span>
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
  )
}

export function RoutingFailuresTable({
  data,
  userFilterOptions,
  initialUserId,
  isRefreshing,
  onRefresh,
  onRetry,
  retryingItemId,
  onRetryAll,
  isRetryingAll,
}: RoutingFailuresTableProps) {
  const [initialPrefs] = React.useState(() => {
    const prefs = readPref(tablePrefsDef)
    if (!initialUserId) return prefs
    // a link from the users table narrows to that user
    return {
      ...prefs,
      filters: [
        ...prefs.filters.filter((filter) => filter.id !== 'userId'),
        { id: 'userId' as const, value: [initialUserId] },
      ],
    }
  })
  const [sorting, setSorting] = React.useState<SortingState>(
    initialPrefs.sorting,
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    initialPrefs.filters,
  )

  React.useEffect(() => {
    const result = persistedStateSchema.safeParse({
      sorting,
      filters: columnFilters,
    })
    if (result.success) {
      writePref(tablePrefsDef, result.data)
    }
  }, [sorting, columnFilters])

  const { pageSize, setPageSize } = useTablePagination('routing-failures', 10)

  const columns = createRoutingFailureColumns({
    onRetry,
    retryingItemId,
    isRetryingAll,
  })

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => String(row.id),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize } },
    state: {
      sorting,
      columnFilters,
      columnVisibility: { userId: false },
    },
  })

  React.useEffect(() => {
    table.setPageSize(pageSize)
  }, [pageSize, table])

  React.useEffect(() => {
    table.setPageIndex(0)
  }, [sorting, columnFilters, table])

  const handleRetryAll = () => {
    const userId = singleFilterValue(columnFilters, 'userId')
    onRetryAll({
      userId: userId ? Number(userId) : undefined,
      category: singleFilterValue(columnFilters, 'category'),
    })
  }

  return (
    <div className="w-full min-w-0 font-base text-main-foreground overflow-x-auto">
      <RoutingFailuresTableToolbar
        table={table}
        userFilterOptions={userFilterOptions}
        isFiltered={columnFilters.length > 0}
        onResetFilters={() => setColumnFilters([])}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        onRetryAll={handleRetryAll}
        isRetryingAll={isRetryingAll}
        retryAllDisabled={data.length === 0 || retryingItemId !== null}
      />

      <div className="rounded-md">
        <Table>
          <TableHeader className="font-heading">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`px-2 py-2 ${
                      (header.column.columnDef.meta as ColumnMetaType)
                        ?.headerClassName || ''
                    }`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`px-2 py-2 ${
                        (cell.column.columnDef.meta as ColumnMetaType)
                          ?.className || ''
                      }`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
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
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50 text-foreground" />
                      <p>Nothing failed to add</p>
                      <p className="text-sm">
                        Watchlist items that could not be added to Radarr or
                        Sonarr will appear here
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

      <PaginationFooter table={table} setPageSize={setPageSize} />
    </div>
  )
}
