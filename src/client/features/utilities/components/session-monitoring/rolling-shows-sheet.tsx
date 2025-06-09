import * as React from 'react'
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
import { formatDistanceToNow } from 'date-fns'

import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Trash2,
  Activity,
  Clock,
  Loader2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { useMediaQuery } from '@/hooks/use-media-query'

import type { RollingMonitoredShow } from '@/features/utilities/hooks/useRollingMonitoring'

import { RollingShowActionAlert } from '@/features/utilities/components/session-monitoring/rolling-show-action-alert'

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

interface RollingShowsSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  shows: RollingMonitoredShow[]
  isLoading: boolean
  error?: Error | null
  onResetShow?: (id: number) => void
  onDeleteShow?: (id: number, shouldReset?: boolean) => void
  showActions?: boolean
  actionLoading?: {
    resetting: boolean
    deleting: boolean
  }
  activeActionId?: number | null
}

/**
 * Renders a responsive, interactive table of rolling monitored shows with sorting, filtering, pagination, and optional reset or delete actions.
 *
 * Adapts layout for desktop (sliding sheet) and mobile (drawer), displaying a list of rolling monitored shows with controls for filtering by title, toggling column visibility, and paginating results. Optionally provides action buttons for resetting or deleting shows, each with confirmation dialogs and loading indicators. Handles loading and error states with appropriate UI feedback.
 *
 * @param isOpen - Whether the sheet or drawer is open.
 * @param onClose - Callback to close the sheet or drawer.
 * @param title - Title displayed in the header.
 * @param shows - List of rolling monitored shows to display.
 * @param isLoading - Whether the data is currently loading.
 * @param error - Error object if loading failed.
 * @param onResetShow - Optional callback to reset a show to its original monitoring state.
 * @param onDeleteShow - Optional callback to remove a show from rolling monitoring (without resetting Sonarr).
 * @param showActions - Whether to display action buttons for each show.
 * @param actionLoading - Loading states for reset and delete actions.
 * @param activeActionId - ID of the show currently being acted upon.
 */
export function RollingShowsSheet({
  isOpen,
  onClose,
  title,
  shows = [],
  isLoading,
  error,
  onResetShow,
  onDeleteShow,
  showActions = true,
  actionLoading = { resetting: false, deleting: false },
  activeActionId = null,
}: RollingShowsSheetProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDesktop = !isMobile

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean
    action: 'reset' | 'delete'
    show: RollingMonitoredShow | null
  }>({
    open: false,
    action: 'reset',
    show: null,
  })

  const columns: ColumnDef<RollingMonitoredShow>[] = [
    {
      accessorKey: 'show_title',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Show
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-xs">
          {row.getValue('show_title')}
        </div>
      ),
    },
    {
      accessorKey: 'plex_username',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            User
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const username = row.getValue('plex_username') as string | null

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-sm truncate max-w-24">
                  {username || (
                    <span className="text-muted-foreground italic font-medium">
                      Master Record
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              {username && (
                <TooltipContent>
                  <p>{username}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )
      },
      meta: {
        className: 'w-[100px]',
      },
    },
    {
      accessorKey: 'monitoring_type',
      header: () => <div>Type</div>,
      cell: ({ row }) => {
        const type = row.getValue('monitoring_type') as string
        const displayType = type === 'pilotRolling' ? 'Pilot' : 'First Season'
        const icon =
          type === 'pilotRolling' ? (
            <Activity className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )

        return (
          <Badge variant="neutral" className="text-xs">
            {icon}
            <span className="ml-1">{displayType}</span>
          </Badge>
        )
      },
      meta: {
        className: 'w-[120px]',
      },
    },
    {
      accessorKey: 'current_monitored_season',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Season
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const season = row.getValue('current_monitored_season') as number
        return <span className="text-sm">S{season}</span>
      },
      meta: {
        className: 'w-[80px]',
      },
    },
    {
      accessorKey: 'last_updated_at',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap hidden sm:flex"
          >
            Last Updated
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const lastUpdated = row.getValue('last_updated_at') as string
        if (!lastUpdated)
          return <span className="text-muted-foreground">-</span>

        return (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
          </span>
        )
      },
      sortingFn: (rowA, rowB) => {
        const dateA = rowA.getValue('last_updated_at') as string | null
        const dateB = rowB.getValue('last_updated_at') as string | null

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
  ]

  // Add actions column if showActions is true
  if (showActions && (onResetShow || onDeleteShow)) {
    columns.push({
      id: 'actions',
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const isActiveReset =
          actionLoading.resetting && activeActionId === row.original.id
        const isActiveDelete =
          actionLoading.deleting && activeActionId === row.original.id
        const isAnyLoading = actionLoading.resetting || actionLoading.deleting

        // Only show action buttons for master records (Global entries without specific user)
        const isMasterRecord = !row.original.plex_username

        if (!isMasterRecord) {
          return (
            <div className="flex items-center justify-center">
              <span className="text-xs text-muted-foreground italic">
                Tracking only
              </span>
            </div>
          )
        }

        return (
          <div className="flex items-center gap-2 justify-center">
            <TooltipProvider>
              {onResetShow && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="noShadow"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          action: 'reset',
                          show: row.original,
                        })
                      }}
                      disabled={isAnyLoading}
                      className="h-8 w-8"
                    >
                      {isActiveReset ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to original monitoring state</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {onDeleteShow && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="error"
                      size="icon"
                      onClick={() => {
                        setConfirmDialog({
                          open: true,
                          action: 'delete',
                          show: row.original,
                        })
                      }}
                      disabled={isAnyLoading}
                      className="transition-opacity h-8 w-8"
                      type="button"
                    >
                      {isActiveDelete ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Remove from rolling monitoring</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </div>
        )
      },
      meta: {
        className: 'w-[100px]',
      },
    })
  }

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
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <X className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Failed to load rolling monitored shows
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        </div>
      )
    }

    return (
      <div className="w-full font-base text-mtext">
        <div>
          <div className="flex items-center justify-between py-4">
            <Input
              placeholder="Filter by show title..."
              value={
                (table.getColumn('show_title')?.getFilterValue() as string) ??
                ''
              }
              onChange={(event) =>
                table
                  .getColumn('show_title')
                  ?.setFilterValue(event.target.value)
              }
              className="w-full max-w-sm min-w-0"
              disabled={isLoading}
            />
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
                    No rolling monitored shows found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-2 py-4">
          <div className="flex items-center space-x-2">
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
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
            <p className="text-sm text-text font-medium hidden xs:block">
              per page
            </p>
          </div>

          <div className="flex items-center justify-center text-sm font-medium text-text">
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
            className="!w-[90vw] md:!w-[70vw] lg:!w-[60vw] xl:!w-[50vw] !max-w-[800px] sm:!max-w-[800px] overflow-y-auto flex flex-col p-5"
          >
            <SheetHeader className="mb-6 flex-shrink-0">
              <SheetTitle className="text-text text-xl">{title}</SheetTitle>
              <SheetDescription>
                {isLoading
                  ? 'Loading rolling monitored shows...'
                  : error
                    ? 'Failed to load rolling monitored shows'
                    : `${table.getFilteredRowModel().rows.length} of ${shows.length} shows`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto pb-8 px-1">
              {renderContent()}
            </div>

            {/* Empty spacer div to ensure content doesn't get cut off */}
            <div className="h-2 flex-shrink-0" />
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer open={isOpen} onOpenChange={onClose}>
          <DrawerContent className="h-[90vh]">
            <DrawerHeader className="mb-6">
              <DrawerTitle className="text-text text-xl">{title}</DrawerTitle>
              <DrawerDescription>
                {isLoading
                  ? 'Loading rolling monitored shows...'
                  : error
                    ? 'Failed to load rolling monitored shows'
                    : `${table.getFilteredRowModel().rows.length} of ${shows.length} shows`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto h-[calc(90vh-120px)]">
              {renderContent()}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Confirmation dialog - rendered once */}
      {confirmDialog.show && (
        <RollingShowActionAlert
          open={confirmDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmDialog({ open: false, action: 'reset', show: null })
            }
          }}
          onConfirm={() => {
            if (
              confirmDialog.show &&
              confirmDialog.action === 'reset' &&
              onResetShow
            ) {
              onResetShow(confirmDialog.show.id)
            } else if (
              confirmDialog.show &&
              confirmDialog.action === 'delete' &&
              onDeleteShow
            ) {
              onDeleteShow(confirmDialog.show.id, false) // Remove only, don't reset
            }
            setConfirmDialog({ open: false, action: 'reset', show: null })
          }}
          showTitle={confirmDialog.show.show_title}
          action={confirmDialog.action}
          isLoading={
            confirmDialog.action === 'reset'
              ? actionLoading.resetting
              : actionLoading.deleting
          }
        />
      )}
    </>
  )
}
