import type { GetUserWatchlistResponse } from '@root/schemas/users/watchlist.schema'
import {
  type ColumnDef,
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
import {
  ArrowUpDown,
  Ban,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  ListX,
  Loader2,
  RefreshCw,
  Tv,
  Undo2,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
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
import { UtilitySectionHeader } from '@/components/ui/utility-section-header'
import { DataTableFacetedFilter } from '@/components/table/data-table-faceted-filter'
import { ExclusionsDeleteConfirmationModal } from '@/features/utilities/components/exclusions/exclusions-delete-confirmation-modal'
import { ExclusionsSkeleton } from '@/features/utilities/components/exclusions/exclusions-skeleton'
import { useExclusions } from '@/features/utilities/hooks/useExclusions'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { useConfigStore } from '@/stores/configStore'
import { api } from '@/lib/api'

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

interface WatchlistItemWithUser {
  title: string
  key: string
  type: string
  status: string
  added: string | null
  userId: number
  username: string
}

interface ExclusionTableRow extends WatchlistItemWithUser {
  id: string
  isExcluded: boolean
  exclusionId: number | null
}

export function ExclusionsPage() {
  const { isInitialized, initialize } = useConfigStore()
  const users = useConfigStore((state) => state.users)
  const isInitializing = useInitializeWithMinDuration(initialize)

  const {
    exclusions,
    isRemoving,
    createExclusion,
    removeExclusion,
    fetchExclusions,
    hasLoadedExclusions,
  } = useExclusions()

  const [watchlistItems, setWatchlistItems] = React.useState<
    WatchlistItemWithUser[]
  >([])
  const [hasLoadedWatchlists, setHasLoadedWatchlists] = React.useState(false)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [excludingItems, setExcludingItems] = React.useState<
    Record<string, boolean>
  >({})
  const [pendingUnexclude, setPendingUnexclude] = React.useState<{
    exclusionId: number
    key: string
    username: string
  } | null>(null)

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'added', desc: true },
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const { pageSize, setPageSize } = useTablePagination('exclusions', 10)

  const fetchAllWatchlistItems = React.useCallback(async () => {
    if (!users?.length) return

    const usersWithItems = users.filter((u) => u.watchlist_count > 0)
    const results = await Promise.all(
      usersWithItems.map(async (user) => {
        try {
          const response = await fetch(api(`/v1/users/${user.id}/watchlist`))
          if (!response.ok) return []
          const data: GetUserWatchlistResponse = await response.json()
          return data.data.watchlistItems.map((item) => ({
            title: item.title,
            key: item.key,
            type: item.type,
            status: item.status,
            added: item.added,
            userId: user.id,
            username: user.name,
          }))
        } catch {
          return []
        }
      }),
    )
    setWatchlistItems(results.flat())
    setHasLoadedWatchlists(true)
  }, [users])

  React.useEffect(() => {
    if (isInitialized && users?.length && !hasLoadedWatchlists) {
      fetchAllWatchlistItems()
    }
  }, [isInitialized, users, hasLoadedWatchlists, fetchAllWatchlistItems])

  const tableData = React.useMemo<ExclusionTableRow[]>(() => {
    return watchlistItems.map((item) => {
      const exclusion = exclusions.find(
        (e) => e.key === item.key && e.user_id === item.userId,
      )
      return {
        ...item,
        id: `${item.userId}-${item.key}`,
        isExcluded: !!exclusion,
        exclusionId: exclusion?.id ?? null,
      }
    })
  }, [watchlistItems, exclusions])

  const handleExclude = async (row: ExclusionTableRow) => {
    const itemKey = `${row.userId}-${row.key}`
    setExcludingItems((prev) => ({ ...prev, [itemKey]: true }))
    try {
      await createExclusion(row.key, [row.userId])
    } finally {
      setExcludingItems((prev) => ({ ...prev, [itemKey]: false }))
    }
  }

  const handleUnexclude = (row: ExclusionTableRow) => {
    if (row.exclusionId) {
      setPendingUnexclude({
        exclusionId: row.exclusionId,
        key: row.key,
        username: row.username,
      })
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([fetchAllWatchlistItems(), fetchExclusions(true)])
    } catch {
      toast.error('Failed to refresh data')
    } finally {
      setIsRefreshing(false)
    }
  }

  const userFilterOptions = React.useMemo(() => {
    const uniqueUsers = new Map(
      watchlistItems.map((item) => [item.userId, item.username]),
    )
    return Array.from(uniqueUsers.values()).map((name) => ({
      label: name,
      value: name,
    }))
  }, [watchlistItems])

  const typeFilterOptions = [
    { label: 'Movie', value: 'movie', icon: Film },
    { label: 'Show', value: 'show', icon: Tv },
  ]

  const columns: ColumnDef<ExclusionTableRow>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-xs">
          {row.getValue('title')}
        </div>
      ),
    },
    {
      accessorKey: 'username',
      header: () => <div>User</div>,
      cell: ({ row }) => (
        <div className="truncate max-w-[150px]">
          {row.getValue('username')}
        </div>
      ),
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
      },
    },
    {
      accessorKey: 'type',
      header: () => <div>Type</div>,
      cell: ({ row }) => {
        const type = row.getValue('type') as string
        const icon =
          type === 'movie' ? (
            <Film className="h-4 w-4" />
          ) : (
            <Tv className="h-4 w-4" />
          )
        return (
          <Badge variant="neutral" className="capitalize">
            {icon}
            <span className="ml-1">{type}</span>
          </Badge>
        )
      },
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
      },
      meta: {
        className: 'w-[100px]',
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        return (
          <Badge variant={status === 'pending' ? 'neutral' : 'default'}>
            {status}
          </Badge>
        )
      },
      sortingFn: (rowA, rowB) => {
        const statusOrder = ['pending', 'requested', 'grabbed', 'notified']
        const statusA = rowA.getValue('status') as string
        const statusB = rowB.getValue('status') as string
        return statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB)
      },
      meta: {
        className: 'w-[100px]',
      },
    },
    {
      accessorKey: 'added',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap hidden sm:flex"
        >
          Added
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const added = row.getValue('added') as string | null
        if (!added) return <span className="text-muted-foreground">-</span>

        const date = new Date(added)
        return (
          <span className="text-sm text-muted-foreground">
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )
      },
      sortingFn: (rowA, rowB) => {
        const dateA = rowA.getValue('added') as string | null
        const dateB = rowB.getValue('added') as string | null
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return new Date(dateA).getTime() - new Date(dateB).getTime()
      },
      meta: {
        className: 'hidden sm:table-cell',
        headerClassName: 'hidden sm:table-cell',
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-center">Excluded</div>,
      enableHiding: false,
      cell: ({ row }) => {
        const itemKey = `${row.original.userId}-${row.original.key}`
        const isExcluding = excludingItems[itemKey] || false
        const isUnexcluding = row.original.exclusionId
          ? isRemoving[row.original.exclusionId] || false
          : false

        if (row.original.isExcluded) {
          return (
            <div className="flex justify-center">
              <Button
                variant="noShadow"
                size="sm"
                className="h-8"
                onClick={() => handleUnexclude(row.original)}
                disabled={isUnexcluding}
              >
                {isUnexcluding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
                <span className="ml-1">
                  {isUnexcluding ? 'Removing...' : 'Unexclude'}
                </span>
              </Button>
            </div>
          )
        }

        return (
          <div className="flex justify-center">
            <Button
              variant="noShadow"
              size="sm"
              className="h-8"
              onClick={() => handleExclude(row.original)}
              disabled={isExcluding}
            >
              {isExcluding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              <span className="ml-1">
                {isExcluding ? 'Excluding...' : 'Exclude'}
              </span>
            </Button>
          </div>
        )
      },
      meta: {
        className: 'w-[140px]',
      },
    },
  ]

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
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

  const isInitialLoad =
    isInitializing || !isInitialized || !hasLoadedWatchlists || !hasLoadedExclusions

  if (isInitialLoad) {
    return <ExclusionsSkeleton />
  }

  return (
    <>
      <ExclusionsDeleteConfirmationModal
        open={pendingUnexclude !== null}
        onOpenChange={(open) => !open && setPendingUnexclude(null)}
        onConfirm={async () => {
          if (pendingUnexclude) {
            await removeExclusion(pendingUnexclude.exclusionId)
          }
        }}
        isSubmitting={
          pendingUnexclude
            ? isRemoving[pendingUnexclude.exclusionId] || false
            : false
        }
        itemKey={pendingUnexclude?.key || ''}
        username={pendingUnexclude?.username || ''}
      />

      <div>
        <UtilitySectionHeader
          title="Watchlist Exclusions"
          description="Manage items excluded from watchlist sync to prevent re-request loops"
          showStatus={false}
        />

        <div className="w-full font-base text-main-foreground">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Input
                placeholder="Filter by title..."
                value={
                  (table.getColumn('title')?.getFilterValue() as string) ?? ''
                }
                onChange={(event) =>
                  table.getColumn('title')?.setFilterValue(event.target.value)
                }
                className="w-full max-w-sm min-w-0"
              />
              {userFilterOptions.length > 0 && (
                <DataTableFacetedFilter
                  column={table.getColumn('username')}
                  title="User"
                  icon={Users}
                  options={userFilterOptions}
                  showSearch={userFilterOptions.length > 5}
                />
              )}
              <DataTableFacetedFilter
                column={table.getColumn('type')}
                title="Type"
                options={typeFilterOptions}
              />
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="noShadow"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8 w-8 p-0"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="noShadow">
                    Columns <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="text-sm text-foreground font-medium pb-2">
            {table.getFilteredRowModel().rows.length} of {tableData.length}{' '}
            items
          </div>

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
                      {watchlistItems.length === 0 ? (
                        <div className="py-8 text-foreground">
                          <ListX className="h-8 w-8 mx-auto mb-2 opacity-50 text-foreground" />
                          <p>No watchlist items found</p>
                          <p className="text-sm">
                            Watchlist items from configured users will appear
                            here
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
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-foreground font-medium hidden xs:block">
                per page
              </p>
            </div>

            <div className="flex items-center justify-center text-sm font-medium text-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
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
      </div>
    </>
  )
}

export default ExclusionsPage
