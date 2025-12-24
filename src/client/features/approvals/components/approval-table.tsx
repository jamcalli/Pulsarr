import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
import { TableRowsSkeleton } from '@/components/ui/table-skeleton'
import { createApprovalColumns } from '@/features/approvals/components/approval-table-columns'
import { ApprovalTableToolbar } from '@/features/approvals/components/approval-table-toolbar'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'

interface ApprovalTableProps {
  data: ApprovalRequestResponse[]
  total: number
  onApprove: (request: ApprovalRequestResponse) => void
  onReject: (request: ApprovalRequestResponse) => void
  onView: (request: ApprovalRequestResponse) => void
  onDelete: (request: ApprovalRequestResponse) => void
  /** True only on initial load (no data yet) - shows skeleton */
  isLoading?: boolean
  onBulkActions?: (selectedRows: ApprovalRequestResponse[]) => void
}

export interface ApprovalTableRef {
  clearSelection: () => void
}

/**
 * Displays a paginated, sortable table of approval requests with server-side pagination and filtering.
 *
 * Pagination and filtering are controlled by the approvalsStore. The table receives pre-filtered,
 * pre-paginated data from the server. Sorting is done client-side on the current page.
 *
 * @param data - The list of approval requests for the current page
 * @param total - Total count of approval requests matching the current filters
 * @returns The rendered approval requests table component
 */
export const ApprovalTable = React.forwardRef<
  ApprovalTableRef,
  ApprovalTableProps
>(
  (
    {
      data,
      total,
      onApprove,
      onReject,
      onView,
      onDelete,
      isLoading = false,
      onBulkActions,
    },
    ref,
  ) => {
    // Server-side pagination state from store
    const pageIndex = useApprovalsStore((s) => s.pageIndex)
    const pageSize = useApprovalsStore((s) => s.pageSize)
    const setPageIndex = useApprovalsStore((s) => s.setPageIndex)
    const setPageSize = useApprovalsStore((s) => s.setPageSize)
    const filters = useApprovalsStore((s) => s.filters)
    const resetFilters = useApprovalsStore((s) => s.resetFilters)

    // Client-side sorting (only sorts current page)
    const [sorting, setSorting] = React.useState<SortingState>([
      { id: 'createdAt', desc: true },
    ])
    const [rowSelection, setRowSelection] = React.useState({})

    // Expose clear selection function to parent component
    React.useImperativeHandle(ref, () => ({
      clearSelection: () => setRowSelection({}),
    }))

    // Calculate page count from total
    const pageCount = Math.ceil(total / pageSize)

    // Check if any filters are active
    const hasActiveFilters =
      filters.status.length > 0 ||
      filters.contentType.length > 0 ||
      filters.triggeredBy.length > 0 ||
      filters.search.length > 0

    const columns = createApprovalColumns({
      onView,
      onApprove,
      onReject,
      onDelete,
    })

    const table = useReactTable({
      data,
      columns,
      pageCount,
      state: {
        sorting,
        rowSelection,
        pagination: {
          pageIndex,
          pageSize,
        },
      },
      onSortingChange: setSorting,
      onRowSelectionChange: setRowSelection,
      onPaginationChange: (updater) => {
        const newPagination =
          typeof updater === 'function'
            ? updater({ pageIndex, pageSize })
            : updater
        if (newPagination.pageIndex !== pageIndex) {
          setPageIndex(newPagination.pageIndex)
        }
        if (newPagination.pageSize !== pageSize) {
          setPageSize(newPagination.pageSize)
        }
      },
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      // Server-side pagination and filtering
      manualPagination: true,
      manualFiltering: true,
      enableRowSelection: true,
    })

    const handleResetFilters = () => {
      resetFilters()
    }

    return (
      <div className="w-full font-base text-main-foreground overflow-x-auto">
        <div>
          <div className="py-4">
            <ApprovalTableToolbar
              table={table}
              isFiltered={hasActiveFilters}
              onResetFilters={handleResetFilters}
              onBulkActions={onBulkActions}
            />
          </div>
        </div>

        <div className="rounded-md">
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
              {isLoading ? (
                <TableRowsSkeleton
                  rows={pageSize}
                  columnCount={columns.length}
                  columns={[
                    { type: 'checkbox' },
                    { type: 'contentWithIcon', width: 'w-40' },
                    { type: 'empty', className: 'p-0 w-0' },
                    { type: 'text', width: 'w-16' },
                    { type: 'badge', width: 'w-24' },
                    { type: 'badge', width: 'w-28' },
                    { type: 'twoLine', width: 'w-16' },
                    { type: 'twoLine', width: 'w-16' },
                    { type: 'button' },
                  ]}
                />
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isExpiredStatus = row.original.status === 'expired'
                      const isActionsColumn = cell.column.id === 'actions'
                      const isSelectColumn = cell.column.id === 'select'

                      return (
                        <TableCell
                          key={cell.id}
                          className={`px-2 py-2 ${
                            isExpiredStatus &&
                            !isActionsColumn &&
                            !isSelectColumn
                              ? 'opacity-60'
                              : ''
                          }`}
                        >
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
                    className="h-40 text-center"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg mb-2 text-muted-foreground">
                        No approval requests found
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {hasActiveFilters
                          ? 'Try adjusting your filters to see more results.'
                          : 'No approval requests have been submitted yet.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between px-2 py-4">
          <div className="flex items-center space-x-2">
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => {
                setPageSize(Number(value))
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
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
              Showing {pageIndex * pageSize + 1}-
              {Math.min((pageIndex + 1) * pageSize, total)} of {total}
            </span>
            <span className="sm:hidden">
              Page {pageIndex + 1} of {pageCount}
            </span>
          </div>

          <div className="space-x-2">
            <Button
              variant="noShadow"
              size="sm"
              onClick={() => setPageIndex(pageIndex - 1)}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 xs:hidden" />
              <span className="hidden xs:inline">Previous</span>
            </Button>
            <Button
              variant="noShadow"
              size="sm"
              onClick={() => setPageIndex(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronRight className="h-4 w-4 xs:hidden" />
              <span className="hidden xs:inline">Next</span>
            </Button>
          </div>
        </div>
      </div>
    )
  },
)

ApprovalTable.displayName = 'ApprovalTable'
