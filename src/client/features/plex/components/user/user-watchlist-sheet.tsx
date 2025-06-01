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
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Film,
  Tv,
} from 'lucide-react'

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
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
import { useMediaQuery } from '@/hooks/use-media-query'
import type { WatchlistItem } from '@root/schemas/users/watchlist.schema'

// Constant keys for skeleton rows to avoid array index warnings
const SKELETON_KEYS = Array.from({ length: 10 }, (_, i) => `skeleton-row-${i}`)

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

interface UserWatchlistSheetProps {
  isOpen: boolean
  onClose: () => void
  userName: string
  watchlistItems?: WatchlistItem[]
  isLoading: boolean
  error?: Error | null
}

/**
 * Displays a responsive, interactive sheet or drawer showing a user's watchlist with sorting, filtering, pagination, and column visibility controls.
 *
 * Renders a table of watchlist items with columns for title, type, status, and added date. Supports filtering by title, sorting by any column, toggling column visibility, and paginating results. Adapts layout between a sliding sheet on desktop and a drawer on mobile. Handles loading and error states with appropriate UI feedback.
 *
 * @param isOpen - Whether the sheet or drawer is open.
 * @param onClose - Callback to close the sheet or drawer.
 * @param userName - The name of the user whose watchlist is displayed.
 * @param watchlistItems - The list of watchlist items to display.
 * @param isLoading - Whether the watchlist data is currently loading.
 * @param error - Optional error object if loading failed.
 *
 * @returns The rendered watchlist sheet or drawer component.
 */
export function UserWatchlistSheet({
  isOpen,
  onClose,
  userName,
  watchlistItems = [],
  isLoading,
  error,
}: UserWatchlistSheetProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isDesktop = !isMobile

  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})

  const columns: ColumnDef<WatchlistItem>[] = [
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
      meta: {
        className: 'w-[100px]',
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Status
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
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
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap hidden sm:flex"
          >
            Added
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
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
  ]

  const table = useReactTable({
    data: watchlistItems,
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
            Failed to load watchlist items
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
              placeholder="Filter by title..."
              value={
                (table.getColumn('title')?.getFilterValue() as string) ?? ''
              }
              onChange={(event) =>
                table.getColumn('title')?.setFilterValue(event.target.value)
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
                        {column.id}
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
              {isLoading ? (
                <>
                  {SKELETON_KEYS.map((key) => (
                    <TableRow key={key}>
                      <TableCell className="px-2 py-2">
                        <Skeleton className="h-4 w-full max-w-[300px]" />
                      </TableCell>
                      <TableCell className="px-2 py-2 w-[100px]">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell className="px-2 py-2 w-[100px]">
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell className="px-2 py-2 hidden sm:table-cell">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ) : table.getRowModel().rows?.length ? (
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
                    No results.
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

  // For desktop - use Sheet
  if (isDesktop) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent
          side="right"
          className="!w-[90vw] md:!w-[70vw] lg:!w-[60vw] xl:!w-[50vw] !max-w-[800px] sm:!max-w-[800px] overflow-y-auto flex flex-col p-5"
        >
          <SheetHeader className="mb-6 flex-shrink-0">
            <SheetTitle className="text-text text-xl">
              {userName}'s Watchlist
            </SheetTitle>
            <SheetDescription>
              {isLoading
                ? 'Loading watchlist items...'
                : error
                  ? 'Failed to load watchlist'
                  : `${table.getFilteredRowModel().rows.length} of ${watchlistItems.length} items`}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pb-8 px-1">
            {renderContent()}
          </div>

          {/* Empty spacer div to ensure content doesn't get cut off */}
          <div className="h-2 flex-shrink-0" />
        </SheetContent>
      </Sheet>
    )
  }

  // For mobile - use Drawer
  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[90vh]">
        <DrawerHeader className="mb-6">
          <DrawerTitle className="text-text text-xl">
            {userName}'s Watchlist
          </DrawerTitle>
          <DrawerDescription>
            {isLoading
              ? 'Loading watchlist items...'
              : error
                ? 'Failed to load watchlist'
                : `${table.getFilteredRowModel().rows.length} of ${watchlistItems.length} items`}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6 overflow-y-auto h-[calc(90vh-120px)]">
          {renderContent()}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
