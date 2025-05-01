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
import UserTableSkeletonRows from '@/features/plex/components/user/user-table-skeleton'
import type { PlexUserTableRow } from '@/features/plex/store/types'

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
 * Renders an interactive table for managing user watchlist data with sorting, filtering, pagination, column visibility toggling, row selection, and bulk editing.
 *
 * The table supports filtering by username, selecting individual or all rows, toggling column visibility, and editing users either individually or in bulk. Pagination and sorting are available for relevant columns. When loading, controls are disabled and skeleton rows are shown.
 *
 * @param users - The user watchlist data to display.
 * @param onEditUser - Callback invoked when editing a single user.
 * @param isLoading - Optional flag indicating loading state; disables controls and displays skeleton rows when true.
 * @param onBulkEdit - Optional callback invoked with selected rows for bulk editing.
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
      header: () => <div className="hidden md:block">Apprise</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('notify_apprise') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
      meta: {
        className: 'hidden md:table-cell',
        headerClassName: 'hidden md:table-cell',
      },
    },
    {
      accessorKey: 'notify_discord',
      header: () => <div className="hidden md:block">Discord</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('notify_discord') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
      meta: {
        className: 'hidden md:table-cell',
        headerClassName: 'hidden md:table-cell',
      },
    },
    {
      accessorKey: 'can_sync',
      header: () => <div className="hidden xs:block">Can Sync</div>,
      cell: ({ row }) => (
        <div className="flex justify-center w-16">
          {row.getValue('can_sync') ? (
            <Check className="h-4 w-4 text-main" />
          ) : (
            <X className="h-4 w-4 text-error" />
          )}
        </div>
      ),
      meta: {
        className: 'hidden xs:table-cell',
        headerClassName: 'hidden xs:table-cell',
      },
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
    <div className="w-full font-base text-mtext">
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
              <UserTableSkeletonRows colSpan={columns.length} />
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
    </div>
  )
}
