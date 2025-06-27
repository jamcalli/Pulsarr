import * as React from 'react'
import {
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import { ApprovalTableToolbar } from '@/features/approvals/components/approval-table-toolbar'
import { createApprovalColumns } from '@/features/approvals/components/approval-table-columns'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalTableProps {
  data: ApprovalRequestResponse[]
  onApprove: (request: ApprovalRequestResponse) => void
  onReject: (request: ApprovalRequestResponse) => void
  onView: (request: ApprovalRequestResponse) => void
  onDelete: (request: ApprovalRequestResponse) => void
  isLoading?: boolean
  onBulkActions?: (selectedRows: ApprovalRequestResponse[]) => void
}

/**
 * Displays a paginated, sortable, and filterable table of approval requests with support for row selection and bulk actions.
 *
 * Renders approval request data in a table with customizable columns, filtering (including date range and status), sorting, and pagination. Provides action handlers for approving, rejecting, viewing, and deleting individual requests, as well as optional bulk actions on selected rows. Shows a loading skeleton when data is loading and displays contextual messages when no data matches the current filters.
 *
 * @param data - Array of approval request objects to display in the table.
 * @param onApprove - Callback invoked when an approval request is approved.
 * @param onReject - Callback invoked when an approval request is rejected.
 * @param onView - Callback invoked when an approval request is viewed.
 * @param onDelete - Callback invoked when an approval request is deleted.
 * @param isLoading - Optional flag to display a loading state.
 * @param onBulkActions - Optional callback for performing actions on selected rows.
 * @returns The rendered approval requests table component.
 */
export function ApprovalTable({
  data,
  onApprove,
  onReject,
  onView,
  onDelete,
  isLoading = false,
  onBulkActions,
}: ApprovalTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'createdAt', desc: true },
  ])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([
    { id: 'status', value: ['pending'] },
  ])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [isTableFiltered, setIsTableFiltered] = React.useState(true)

  const columns = createApprovalColumns({
    onView,
    onApprove,
    onReject,
    onDelete,
  })

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: (filters) => {
      setColumnFilters(filters)
      setIsTableFiltered(filters.length > 0)
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    enableRowSelection: true,
    filterFns: {
      dateRange: (row, columnId, filterValue) => {
        if (!filterValue) return true
        const date = new Date(row.getValue(columnId) as string)
        if (Number.isNaN(date.getTime())) return true

        const [start, end] = filterValue.split(' to ')
        const startDate = start ? new Date(start) : null
        const endDate = end ? new Date(end) : null

        if (
          startDate &&
          (Number.isNaN(startDate.getTime()) || date < startDate)
        )
          return false
        if (endDate && (Number.isNaN(endDate.getTime()) || date > endDate))
          return false
        return true
      },
    },
  })

  const handleResetFilters = () => {
    table.resetColumnFilters()
    setIsTableFiltered(false)
  }

  return (
    <div className="w-full font-base text-main-foreground overflow-x-auto">
      <div>
        <div className="py-4">
          <ApprovalTableToolbar
            table={table}
            isFiltered={isTableFiltered}
            onResetFilters={handleResetFilters}
            onBulkActions={onBulkActions}
          />
        </div>
      </div>

      <div className="rounded-md">
        {isLoading ? (
          <TableSkeleton
            rows={Math.min(5, table.getState().pagination.pageSize)}
            columns={[
              { type: 'checkbox' },
              { type: 'text', width: 'w-32' },
              { type: 'text', width: 'w-24' },
              { type: 'text', width: 'w-20' },
              { type: 'text', width: 'w-32' },
              { type: 'badge', width: 'w-20' },
              { type: 'text', width: 'w-28' },
              { type: 'text', width: 'w-28' },
              { type: 'button', width: 'w-8', className: 'text-right' },
            ]}
            showHeader={true}
          />
        ) : (
          <Table>
            <TableHeader className="font-heading">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="px-2 py-2">
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
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={
                      row.original.expiresAt &&
                      new Date(row.original.expiresAt) < new Date()
                        ? 'opacity-60'
                        : ''
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-2 py-2">
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
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg mb-2 text-muted-foreground">
                        No approval requests found
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isTableFiltered
                          ? 'Try adjusting your filters to see more results.'
                          : 'No approval requests have been submitted yet.'}
                      </p>
                    </div>
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
