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
  Check,
  X,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UserWatchlistInfo } from '@/stores/configStore'
import type { PlexUserTableRow } from '@/features/plex/store/types'
import { UserWatchlistSheet } from '@/features/plex/components/user/user-watchlist-sheet'
import { useUserWatchlist } from '@/features/plex/hooks/useUserWatchlist'
import { toast } from '@/hooks/use-toast'
import { TableSkeleton } from '@/components/ui/table-skeleton'

interface ColumnMetaType {
  className?: string
  headerClassName?: string
}

interface UserTableProps {
  users: UserWatchlistInfo[]
  onEditUser: (user: UserWatchlistInfo) => void
  isLoading?: boolean
  onBulkEdit?: (selectedRows: PlexUserTableRow[]) => void
}

/**
 * Renders an interactive table for managing user watchlist data, supporting sorting, filtering by username, pagination, column visibility toggling, row selection, and both individual and bulk editing.
 *
 * Users can edit individual user details, perform bulk edits on selected rows, and open a modal to view a user's watchlist. The table adapts to loading state, disables controls as needed, and displays visual indicators for notification and sync statuses.
 *
 * @remark If a user's ID is invalid when attempting to view their watchlist, an error is logged and a destructive toast notification is shown; the modal will not open.
 */
export default function UserTable({
  users,
  onEditUser,
  isLoading = false,
  onBulkEdit,
}: UserTableProps) {
  // Table state
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [selectedUserName, setSelectedUserName] = React.useState<string>('')

  const {
    watchlistData,
    isLoading: isWatchlistLoading,
    error: watchlistError,
    isOpen,
    handleOpen,
    handleClose,
  } = useUserWatchlist()

  const columns: ColumnDef<UserWatchlistInfo>[] = [
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
          disabled={isLoading}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          disabled={isLoading}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Username
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-xs">
          {row.getValue('name')}
          {row.original.alias && (
            <span className="ml-2 text-sm text-muted-foreground">
              ({row.original.alias})
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'notify_apprise',
      header: () => <div>Apprise</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('notify_apprise') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'notify_discord',
      header: () => <div>Discord</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('notify_discord') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'notify_tautulli',
      header: () => <div>Tautulli</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('notify_tautulli') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'can_sync',
      header: () => <div>Can Sync</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('can_sync') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
    },
    {
      accessorKey: 'requires_approval',
      header: () => <div>Requires Approval</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('requires_approval') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
    },

    {
      accessorKey: 'watchlist_count',
      header: ({ column }) => {
        return (
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Items
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const count = Number(row.getValue('watchlist_count'))
        return (
          <div className="text-right font-medium w-16">
            {count.toLocaleString()}
          </div>
        )
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const user = row.original

        return (
          <div className="w-8">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="noShadow" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onEditUser(user)}>
                  Edit user
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedUserName(user.name)
                    const userId = Number.parseInt(user.id)
                    if (!Number.isNaN(userId) && userId > 0) {
                      handleOpen(userId)
                    } else {
                      console.error('Invalid user ID:', user.id)
                      toast({
                        title: 'Error',
                        description: 'Unable to open watchlist for this user',
                        variant: 'destructive',
                      })
                    }
                  }}
                >
                  View Watchlist
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  const table = useReactTable({
    data: users,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  return (
    <div className="w-full font-base text-mtext overflow-x-auto">
      <div>
        <div className="flex items-center justify-between py-4">
          <Input
            placeholder="Filter by username..."
            value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
            onChange={(event) =>
              table.getColumn('name')?.setFilterValue(event.target.value)
            }
            className="w-full max-w-sm min-w-0"
            disabled={isLoading}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="noShadow" className="ml-4" disabled={isLoading}>
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

        {/* Bulk edit button that appears when rows are selected */}
        {table.getFilteredSelectedRowModel().rows.length > 0 && onBulkEdit && (
          <div className="pb-4">
            <Button
              variant="blue"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => {
                onBulkEdit(table.getFilteredSelectedRowModel().rows)
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-edit"
                aria-labelledby="editIconTitle"
              >
                <title id="editIconTitle">Edit Icon</title>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Bulk Edit ({table.getFilteredSelectedRowModel().rows.length})
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-md">
        {isLoading ? (
          <TableSkeleton
            rows={table.getState().pagination.pageSize}
            columns={[
              { type: 'checkbox' },
              { type: 'text', width: 'w-32' },
              { type: 'icon' },
              { type: 'icon' },
              { type: 'icon' },
              { type: 'icon' },
              { type: 'text', width: 'w-16' },
              { type: 'button', width: 'w-8', className: 'text-right' },
            ]}
            showHeader={true}
          />
        ) : (
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
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
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
              <SelectValue placeholder={table.getState().pagination.pageSize} />
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
      {isOpen && (
        <UserWatchlistSheet
          isOpen={isOpen}
          onClose={handleClose}
          userName={selectedUserName}
          watchlistItems={watchlistData?.watchlistItems}
          isLoading={isWatchlistLoading}
          error={watchlistError}
        />
      )}
    </div>
  )
}
