import type { SonarrShowsResponse } from '@root/schemas/session-monitoring/session-monitoring.schema'
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  Activity,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  ListPlus,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSonarrStore } from '@/features/sonarr/store/sonarrStore'
import { useSonarrShowsQuery } from '@/features/utilities/hooks/useSessionMonitoringQueries'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useTablePagination } from '@/hooks/use-table-pagination'

export type SonarrShow = SonarrShowsResponse['shows'][number]

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

interface ManageRollingSheetProps {
  isOpen: boolean
  onClose: () => void
  isEnabled: boolean
  onManageSelected: (shows: SonarrShow[]) => void
}

export function ManageRollingSheet({
  isOpen,
  onClose,
  isEnabled,
  onManageSelected,
}: ManageRollingSheetProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDesktop = !isMobile

  const instances = useSonarrStore((s) => s.instances)
  const isMultiInstance = instances.length > 1

  // Data fetching
  const { data, isLoading, error } = useSonarrShowsQuery(
    undefined,
    isEnabled && isOpen,
  )
  const shows = React.useMemo(() => data?.shows ?? [], [data?.shows])

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      instance: isMultiInstance,
    })
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  // Persistent table pagination
  const { pageSize, setPageSize } = useTablePagination('manage-rolling', 10)

  // Update instance column visibility when instances change
  React.useEffect(() => {
    setColumnVisibility((prev) => ({
      ...prev,
      instance: isMultiInstance,
    }))
  }, [isMultiInstance])

  const columns: ColumnDef<SonarrShow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'title',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Title
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-xs">
          {row.getValue('title')}
        </div>
      ),
    },
    {
      id: 'instance',
      accessorKey: 'sonarrInstanceId',
      header: () => <div>Instance</div>,
      cell: ({ row }) => {
        const instanceId = row.original.sonarrInstanceId
        const instance = instances.find((i) => i.id === instanceId)
        return (
          <span className="text-sm truncate max-w-[8rem] block">
            {instance?.name ?? `Instance ${instanceId}`}
          </span>
        )
      },
      filterFn: (row, _id, filterValue) => {
        if (!filterValue || filterValue === 'all') return true
        return row.original.sonarrInstanceId === Number(filterValue)
      },
      meta: {
        className: 'w-[120px]',
      },
    },
    {
      id: 'status',
      header: () => <div>Status</div>,
      cell: ({ row }) => {
        const { rollingShowId, monitoringType } = row.original

        if (rollingShowId === null) {
          return (
            <Badge variant="neutral" className="text-xs opacity-60">
              Not Enrolled
            </Badge>
          )
        }

        let displayType: string
        let icon: React.ReactNode
        if (monitoringType === 'pilotRolling') {
          displayType = 'Pilot'
          icon = <Activity className="h-4 w-4" />
        } else if (monitoringType === 'allSeasonPilotRolling') {
          displayType = 'All Season Pilot'
          icon = <Layers className="h-4 w-4" />
        } else {
          displayType = 'First Season'
          icon = <Clock className="h-4 w-4" />
        }

        return (
          <Badge variant="neutral" className="text-xs">
            {icon}
            <span className="ml-1">{displayType}</span>
          </Badge>
        )
      },
      meta: {
        className: 'w-[150px]',
      },
    },
  ]

  const table = useReactTable({
    data: shows,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    initialState: {
      pagination: {
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  // Update table pageSize when localStorage value changes
  React.useEffect(() => {
    table.setPageSize(pageSize)
  }, [pageSize, table])

  const selectedShows = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original)

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <X className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Failed to load Sonarr shows
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        </div>
      )
    }

    return (
      <div className="w-full font-base text-main-foreground">
        <div>
          <div className="flex items-center justify-between py-4">
            <Input
              placeholder="Filter by show title..."
              value={
                (table.getColumn('title')?.getFilterValue() as string) ?? ''
              }
              onChange={(event) =>
                table.getColumn('title')?.setFilterValue(event.target.value)
              }
              className="w-full max-w-sm min-w-0"
              disabled={isLoading}
            />
            <div className="flex items-center">
              {isMultiInstance && (
                <Select
                  value={
                    (table.getColumn('instance')?.getFilterValue() as string) ??
                    'all'
                  }
                  onValueChange={(value) =>
                    table
                      .getColumn('instance')
                      ?.setFilterValue(value === 'all' ? undefined : value)
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-[140px] ml-4">
                    <SelectValue placeholder="All instances" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All instances</SelectItem>
                    {instances.map((inst) => (
                      <SelectItem key={inst.id} value={String(inst.id)}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedShows.length > 0 && (
                <Button
                  variant="noShadow"
                  onClick={() => onManageSelected(selectedShows)}
                  className="ml-4 whitespace-nowrap"
                >
                  <ListPlus className="h-4 w-4" />
                  Manage ({selectedShows.length})
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="noShadow"
                    className="ml-4"
                    disabled={isLoading}
                  >
                    Columns <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) =>
                            column.toggleVisibility(!!value)
                          }
                        >
                          {column.id.replaceAll('_', ' ')}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
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
                    const meta = header.column.columnDef.meta as
                      | ColumnMetaType
                      | undefined
                    const headerClassName = `px-2 py-2 ${meta?.headerClassName || ''}`
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
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | ColumnMetaType
                        | undefined
                      const cellClassName = `px-2 py-2 ${meta?.className || ''}`
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
                    No Sonarr shows found.
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
              disabled={isLoading}
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
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage() || isLoading}
            >
              <ChevronLeft className="h-4 w-4 xs:hidden" />
              <span className="hidden xs:inline">Previous</span>
            </Button>
            <Button
              variant="noShadow"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || isLoading}
            >
              <ChevronRight className="h-4 w-4 xs:hidden" />
              <span className="hidden xs:inline">Next</span>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Conditional rendering for desktop/mobile */}
      {isDesktop ? (
        <Sheet open={isOpen} onOpenChange={onClose}>
          <SheetContent
            side="right"
            className="w-[90vw]! md:w-[70vw]! lg:w-[60vw]! xl:w-[50vw]! max-w-[800px]! sm:max-w-[800px]! overflow-y-auto flex flex-col p-5"
          >
            <SheetHeader className="mb-6 shrink-0">
              <SheetTitle className="text-foreground text-xl">
                Manage Rolling Monitoring
              </SheetTitle>
              <SheetDescription>
                {isLoading
                  ? 'Loading Sonarr shows...'
                  : error
                    ? 'Failed to load Sonarr shows'
                    : `${table.getFilteredRowModel().rows.length} of ${shows.length} shows`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto pb-8 px-1">
              {renderContent()}
            </div>

            {/* Empty spacer div to ensure content doesn't get cut off */}
            <div className="h-2 shrink-0" />
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer open={isOpen} onOpenChange={onClose}>
          <DrawerContent className="h-[90vh]">
            <DrawerHeader className="mb-6">
              <DrawerTitle className="text-foreground text-xl">
                Manage Rolling Monitoring
              </DrawerTitle>
              <DrawerDescription>
                {isLoading
                  ? 'Loading Sonarr shows...'
                  : error
                    ? 'Failed to load Sonarr shows'
                    : `${table.getFilteredRowModel().rows.length} of ${shows.length} shows`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto h-[calc(90vh-120px)]">
              {renderContent()}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  )
}
