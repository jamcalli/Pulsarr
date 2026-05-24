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
import { DataTableFacetedFilter } from '@/components/table/data-table-faceted-filter'
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
import { WatchlistExclusionsDeleteConfirmationModal } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-delete-confirmation-modal'
import { WatchlistExclusionsSkeleton } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-skeleton'
import {
  useCreateWatchlistExclusion,
  useRemoveWatchlistExclusion,
} from '@/features/utilities/hooks/useWatchlistExclusionMutations'
import { useWatchlistExclusions } from '@/features/utilities/hooks/useWatchlistExclusions'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { useInitializeWithMinDuration } from '@/hooks/useInitializeWithMinDuration'
import { api } from '@/lib/api'
import { useConfigStore } from '@/stores/configStore'

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

interface WatchlistExclusionTableRow extends WatchlistItemWithUser {
  id: string
  isExcluded: boolean
  exclusionId: number | null
}

export function WatchlistExclusionsPage() {
  const { isInitialized, initialize } = useConfigStore()
  const users = useConfigStore((state) => state.users)
  const isInitializing = useInitializeWithMinDuration(initialize)

  const { data: exclusionsData, refetch: refetchExclusions } =
    useWatchlistExclusions()
  const exclusions = exclusionsData?.exclusions ?? []
  const hasLoadedExclusions = exclusionsData !== undefined

  const createExclusionMutation = useCreateWatchlistExclusion()
  const removeExclusionMutation = useRemoveWatchlistExclusion()

  const [watchlistItems, setWatchlistItems] = React.useState<
    WatchlistItemWithUser[]
  >([])
  const [hasLoadedWatchlists, setHasLoadedWatchlists] = React.useState(false)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
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
    React.useState<VisibilityState>({ added: false })
  const { pageSize, setPageSize } = useTablePagination(
    'watchlist-exclusions',
    10,
  )

  const fetchAllWatchlistItems = React.useCallback(async () => {
    if (!users?.length) {
      setWatchlistItems([])
      setHasLoadedWatchlists(true)
      return
    }

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
    if (isInitialized && !hasLoadedWatchlists) {
      fetchAllWatchlistItems()
    }
  }, [isInitialized, hasLoadedWatchlists, fetchAllWatchlistItems])

  const tableData = React.useMemo<WatchlistExclusionTableRow[]>(() => {
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

  const handleExclude = async (row: WatchlistExclusionTableRow) => {
    try {
      await createExclusionMutation.mutateAsync({
        key: row.key,
        userIds: [row.userId],
      })
      toast.success('Exclusion created successfully')
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create exclusion'
      toast.error(errorMessage)
    }
  }

  const handleUnexclude = (row: WatchlistExclusionTableRow) => {
    if (row.exclusionId) {
      setPendingUnexclude({
        exclusionId: row.exclusionId,
        key: row.key,
        username: row.username,
      })
    }
  }

  const handleConfirmUnexclude = async () => {
    if (!pendingUnexclude) return
    try {
      await removeExclusionMutation.mutateAsync(pendingUnexclude.exclusionId)
      toast.success('Exclusion removed successfully')
      setPendingUnexclude(null)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to remove exclusion'
      toast.error(errorMessage)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([fetchAllWatchlistItems(), refetchExclusions()])
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

  const columns: ColumnDef<WatchlistExclusionTableRow>[] = [
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
      cell: ({ row }) => {
        const type = row.original.type
        const Icon = type === 'movie' ? Film : Tv
        return (
          <div className="flex items-center gap-2 max-w-xs">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="truncate">
              <div className="font-medium truncate">
                {row.getValue('title')}
              </div>
              <div className="text-sm text-muted-foreground capitalize">
                {type}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'username',
      header: () => <div>User</div>,
      cell: ({ row }) => (
        <div className="truncate max-w-[150px]">{row.getValue('username')}</div>
      ),
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
      },
    },
    {
      // Hidden column used only for type filtering - not displayed in UI
      accessorKey: 'type',
      id: 'type',
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableHiding: false,
      size: 0,
      minSize: 0,
      maxSize: 0,
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
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
          className="whitespace-nowrap"
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
    },
    {
      id: 'actions',
      accessorFn: (row) => row.isExcluded,
      header: ({ column }) => (
        <div className="flex justify-center">
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Excluded
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ),
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.isExcluded ? 1 : 0
        const b = rowB.original.isExcluded ? 1 : 0
        return a - b
      },
      enableHiding: false,
      cell: ({ row }) => {
        const isExcluding =
          createExclusionMutation.isPending &&
          createExclusionMutation.variables?.key === row.original.key &&
          createExclusionMutation.variables?.userIds.includes(
            row.original.userId,
          )
        const isUnexcluding =
          row.original.exclusionId !== null &&
          removeExclusionMutation.variables === row.original.exclusionId &&
          removeExclusionMutation.isPending

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

  const isInitialLoad =
    isInitializing ||
    !isInitialized ||
    !hasLoadedWatchlists ||
    !hasLoadedExclusions

  if (isInitialLoad) {
    return <WatchlistExclusionsSkeleton />
  }

  return (
    <>
      <WatchlistExclusionsDeleteConfirmationModal
        open={pendingUnexclude !== null}
        onOpenChange={(open) => !open && setPendingUnexclude(null)}
        onConfirm={handleConfirmUnexclude}
        isSubmitting={
          pendingUnexclude !== null &&
          removeExclusionMutation.variables === pendingUnexclude.exclusionId &&
          removeExclusionMutation.isPending
        }
        username={pendingUnexclude?.username || ''}
      />

      <div>
        <UtilitySectionHeader
          title="Watchlist Exclusions"
          description="Prevent specific watchlist items from being routed to Sonarr and Radarr"
          showStatus={false}
        />

        <div className="grid gap-4">
          <div className="w-full min-w-0 font-base text-main-foreground overflow-x-auto">
            <div className="space-y-2 py-4">
              {/* First row - Search input */}
              <div className="flex items-center space-x-2">
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
              </div>

              {/* Second row - Filters and action buttons */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="noShadow"
                    size="sm"
                    aria-label="Refresh exclusions"
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
                          <TableHead
                            key={header.id}
                            className={headerClassName}
                          >
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
                {(() => {
                  const filteredCount = table.getFilteredRowModel().rows.length
                  const pageIndex = table.getState().pagination.pageIndex
                  const pageSize = table.getState().pagination.pageSize
                  const pageCount = table.getPageCount()
                  const start = pageIndex * pageSize + 1
                  const end = Math.min(
                    (pageIndex + 1) * pageSize,
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
        </div>
      </div>
    </>
  )
}

export default WatchlistExclusionsPage
