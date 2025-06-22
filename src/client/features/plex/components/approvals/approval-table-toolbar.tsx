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

export function ApprovalTableToolbar({
  table,
  isFiltered,
  onResetFilters,
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

      {/* Second row - Filter buttons and columns */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 flex-wrap">
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
        </div>

        {/* Columns button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="noShadow" className="h-10 ml-4">
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
  )
}
