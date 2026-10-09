import type { Table } from '@tanstack/react-table'
import { Loader2, RefreshCw, RotateCw, Users, X } from 'lucide-react'
import { DataTableFacetedFilter } from '@/components/table/data-table-faceted-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTING_FAILURE_CATEGORY_META } from '@/features/requests/components/routing-failures/routing-failure-category-badge'
import type { RoutingFailureRow } from '@/features/requests/components/routing-failures/routing-failures-table-columns'

interface RoutingFailuresTableToolbarProps {
  table: Table<RoutingFailureRow>
  userFilterOptions: Array<{ label: string; value: string }>
  isFiltered: boolean
  onResetFilters: () => void
  isRefreshing: boolean
  onRefresh: () => void
  onRetryAll: () => void
  isRetryingAll: boolean
  retryAllDisabled: boolean
}

const categoryFilterOptions = Object.entries(ROUTING_FAILURE_CATEGORY_META).map(
  ([value, meta]) => ({ label: meta.label, value }),
)

export function RoutingFailuresTableToolbar({
  table,
  userFilterOptions,
  isFiltered,
  onResetFilters,
  isRefreshing,
  onRefresh,
  onRetryAll,
  isRetryingAll,
  retryAllDisabled,
}: RoutingFailuresTableToolbarProps) {
  return (
    <div className="space-y-2 py-4">
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Filter by title..."
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('title')?.setFilterValue(event.target.value)
          }
          className="w-full max-w-sm min-w-0"
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {userFilterOptions.length > 0 && (
            <DataTableFacetedFilter
              column={table.getColumn('userId')}
              title="User"
              icon={Users}
              options={userFilterOptions}
              showSearch={userFilterOptions.length > 5}
            />
          )}
          <DataTableFacetedFilter
            column={table.getColumn('category')}
            title="Reason"
            options={categoryFilterOptions}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="noShadow"
            aria-label="Refresh routing failures"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-10 w-10 p-0"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
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
          <Button
            variant="blue"
            onClick={onRetryAll}
            disabled={retryAllDisabled || isRetryingAll}
            className="h-10"
          >
            {isRetryingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
            <span className="ml-2">
              {isRetryingAll ? 'Retrying...' : 'Retry All'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
