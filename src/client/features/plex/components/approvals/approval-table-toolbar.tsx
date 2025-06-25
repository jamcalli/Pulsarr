import type { Table } from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Monitor,
  Tv,
  Zap,
  CircleCheckBig,
  Users,
  ChevronDown,
} from 'lucide-react'
import { DataTableFacetedFilter } from '@/components/table/data-table-faceted-filter'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'

interface ApprovalTableToolbarProps {
  table: Table<ApprovalRequestResponse>
  isFiltered: boolean
  onResetFilters: () => void
  onBulkActions?: (selectedRows: ApprovalRequestResponse[]) => void
}

// Filter options
const statusOptions = [
  { label: 'Pending', value: 'pending', icon: Clock },
  { label: 'Approved', value: 'approved', icon: CheckCircle },
  { label: 'Rejected', value: 'rejected', icon: XCircle },
  { label: 'Expired', value: 'expired', icon: AlertCircle },
]

const contentTypeOptions = [
  { label: 'Movie', value: 'movie', icon: Monitor },
  { label: 'TV Show', value: 'show', icon: Tv },
]

const triggerOptions = [
  { label: 'Quota Exceeded', value: 'quota_exceeded', icon: AlertCircle },
  { label: 'Router Rule', value: 'router_rule', icon: Zap },
  { label: 'Manual Flag', value: 'manual_flag', icon: User },
  { label: 'Content Criteria', value: 'content_criteria', icon: CheckCircle },
]

/**
 * Renders a toolbar for the approval requests table, providing search, faceted filtering, bulk actions, and column visibility controls.
 *
 * The toolbar includes a search input for content titles, dynamic filters for status, user, content type, and trigger, a bulk actions button for selected rows, a reset filters button, and a dropdown menu to toggle column visibility.
 *
 * @param isFiltered - Indicates if any filters are currently applied to the table.
 * @param onResetFilters - Callback invoked to clear all active filters.
 * @param onBulkActions - Optional callback triggered with the currently selected approval requests for bulk operations.
 */
export function ApprovalTableToolbar({
  table,
  isFiltered,
  onResetFilters,
  onBulkActions,
}: ApprovalTableToolbarProps) {
  // Get unique users from the table data for the user filter
  const uniqueUsers = Array.from(
    new Set(
      table.getPreFilteredRowModel().rows.map((row) => row.original.userName),
    ),
  )
    .sort()
    .map((user) => ({
      label: user,
      value: user,
    }))

  return (
    <div className="space-y-2">
      {/* First row - Search input */}
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Filter content..."
          value={
            (table.getColumn('contentTitle')?.getFilterValue() as string) ?? ''
          }
          onChange={(event) =>
            table.getColumn('contentTitle')?.setFilterValue(event.target.value)
          }
          className="w-full max-w-sm min-w-0"
        />
      </div>

      {/* Second row - Bulk actions */}
      <div className="flex items-center justify-start gap-2">
        {/* Bulk actions button */}
        {table.getFilteredSelectedRowModel().rows.length > 0 &&
          onBulkActions && (
            <Button
              variant="blue"
              size="sm"
              className="flex items-center gap-2 h-10"
              onClick={() => {
                const selectedRequests = table
                  .getFilteredSelectedRowModel()
                  .rows.map((row) => row.original)
                onBulkActions(selectedRequests)
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
              Bulk Actions ({table.getFilteredSelectedRowModel().rows.length})
            </Button>
          )}
      </div>

      {/* Third row - Filters and action buttons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left side - Filter buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          {table.getColumn('status') && (
            <DataTableFacetedFilter
              column={table.getColumn('status')}
              title="Status"
              icon={CircleCheckBig}
              options={statusOptions}
            />
          )}

          {/* User filter */}
          {table.getColumn('userName') && uniqueUsers.length > 0 && (
            <DataTableFacetedFilter
              column={table.getColumn('userName')}
              title="User"
              icon={Users}
              options={uniqueUsers}
              showSearch={true}
            />
          )}

          {/* Content type filter */}
          {table.getColumn('contentTitle') && (
            <DataTableFacetedFilter
              column={table.getColumn('contentTitle')}
              title="Content Type"
              icon={Monitor}
              options={contentTypeOptions}
              filterFn={(row, _columnId, filterValue) => {
                return filterValue.includes(row.original.contentType)
              }}
            />
          )}

          {/* Trigger type filter */}
          {table.getColumn('triggeredBy') && (
            <DataTableFacetedFilter
              column={table.getColumn('triggeredBy')}
              title="Trigger"
              icon={Zap}
              options={triggerOptions}
            />
          )}
        </div>

        {/* Right side - Reset and Columns buttons */}
        <div className="flex items-center gap-2">
          {/* Reset filters button */}
          {isFiltered && (
            <Button
              variant="error"
              onClick={onResetFilters}
              className="h-10 px-2 lg:px-3"
            >
              Reset
              <X className="ml-2 h-4 w-4" />
            </Button>
          )}

          {/* Columns button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="noShadow" className="h-10 px-2 lg:px-3">
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
                      {(column.columnDef.meta as { displayName?: string })
                        ?.displayName || column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
