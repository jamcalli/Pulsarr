import type { ApprovalRequestResponse } from '@root/schemas/approval/approval.schema'
import type { Table } from '@tanstack/react-table'
import {
  AlertCircle,
  Bot,
  CheckCircle,
  ChevronDown,
  CircleCheckBig,
  Clock,
  Edit,
  Monitor,
  Tv,
  User,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { DataTableFacetedFilter } from '@/components/table/data-table-faceted-filter'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useApprovals } from '@/features/approvals/hooks/useApprovals'
import { useApprovalsStore } from '@/features/approvals/store/approvalsStore'

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
  { label: 'Auto-Approved', value: 'auto_approved', icon: Bot },
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
 * Renders a toolbar for the approval requests table with search, faceted filtering, bulk actions, and column visibility controls.
 *
 * The toolbar includes a search input for content titles, dynamic filters for status, user, content type, and trigger, a bulk actions button for selected rows, a reset filters button, and a dropdown menu to toggle column visibility.
 *
 * @param isFiltered - Indicates whether any filters are currently applied.
 * @param onResetFilters - Function to clear all active filters.
 * @param onBulkActions - Optional function called with the selected approval requests for bulk operations.
 */
export function ApprovalTableToolbar({
  table,
  isFiltered,
  onResetFilters,
  onBulkActions,
}: ApprovalTableToolbarProps) {
  // Server-side filter state from store
  const filters = useApprovalsStore((s) => s.filters)
  const setFilters = useApprovalsStore((s) => s.setFilters)
  const { isLoading } = useApprovals()

  // Local state for debounced search
  const [searchValue, setSearchValue] = useState(filters.search)

  // Debounce search input
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== filters.search) {
        setFilters({ search: searchValue })
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchValue, filters.search, setFilters])

  // Sync local search state with store when filters are reset
  useEffect(() => {
    setSearchValue(filters.search)
  }, [filters.search])

  return (
    <div className="space-y-2">
      {/* First row - Search input */}
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Search content..."
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          className="w-full max-w-sm min-w-0"
          disabled={isLoading}
        />
      </div>

      {/* Second row - Bulk actions */}
      <div className="flex items-center justify-start gap-2">
        {/* Bulk actions button */}
        {table.getSelectedRowModel().rows.length > 0 && onBulkActions && (
          <Button
            variant="blue"
            size="sm"
            className="flex items-center gap-2 h-10"
            onClick={() => {
              const selectedRequests = table
                .getSelectedRowModel()
                .rows.map((row) => row.original)
              onBulkActions(selectedRequests)
            }}
          >
            <Edit className="h-4 w-4" />
            Bulk Actions ({table.getSelectedRowModel().rows.length})
          </Button>
        )}
      </div>

      {/* Third row - Filters and action buttons */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left side - Filter buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter - server-side */}
          <DataTableFacetedFilter
            title="Status"
            icon={CircleCheckBig}
            options={statusOptions}
            value={filters.status}
            onChange={(values) =>
              setFilters({
                status: values as typeof filters.status,
              })
            }
            disabled={isLoading}
          />

          {/* Content type filter - server-side */}
          <DataTableFacetedFilter
            title="Content Type"
            icon={Monitor}
            options={contentTypeOptions}
            value={filters.contentType}
            onChange={(values) =>
              setFilters({
                contentType: values as typeof filters.contentType,
              })
            }
            disabled={isLoading}
          />

          {/* Trigger type filter - server-side */}
          <DataTableFacetedFilter
            title="Trigger"
            icon={Zap}
            options={triggerOptions}
            value={filters.triggeredBy}
            onChange={(values) =>
              setFilters({
                triggeredBy: values as typeof filters.triggeredBy,
              })
            }
            disabled={isLoading}
          />
        </div>

        {/* Right side - Reset and Columns buttons */}
        <div className="flex items-center gap-2">
          {/* Reset filters button */}
          {isFiltered && (
            <Button
              variant="error"
              onClick={onResetFilters}
              className="h-10 px-2 lg:px-3"
              disabled={isLoading}
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
