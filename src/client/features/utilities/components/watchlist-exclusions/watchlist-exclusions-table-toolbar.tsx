import type { Table } from '@tanstack/react-table'
import {
  ChevronDown,
  Edit,
  Film,
  Loader2,
  RefreshCw,
  Trash2,
  Tv,
  Users,
  X,
} from 'lucide-react'
import { DataTableFacetedFilter } from '@/components/table/data-table-faceted-filter'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { WatchlistExclusionTableRow } from '@/features/utilities/components/watchlist-exclusions/watchlist-exclusions-table-columns'

interface WatchlistExclusionsTableToolbarProps {
  table: Table<WatchlistExclusionTableRow>
  userFilterOptions: Array<{ label: string; value: string }>
  isFiltered: boolean
  onResetFilters: () => void
  isRefreshing: boolean
  onRefresh: () => void
  onBulkExclude?: (selectedRows: WatchlistExclusionTableRow[]) => void
  onBulkRemove?: (selectedRows: WatchlistExclusionTableRow[]) => void
}

const typeFilterOptions = [
  { label: 'Movie', value: 'movie', icon: Film },
  { label: 'Show', value: 'show', icon: Tv },
]

const statusFilterOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Requested', value: 'requested' },
  { label: 'Grabbed', value: 'grabbed' },
  { label: 'Notified', value: 'notified' },
]

export function WatchlistExclusionsTableToolbar({
  table,
  userFilterOptions,
  isFiltered,
  onResetFilters,
  isRefreshing,
  onRefresh,
  onBulkExclude,
  onBulkRemove,
}: WatchlistExclusionsTableToolbarProps) {
  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original)
  const excludableSelected = selectedRows.filter(
    (r) => r.rowKind === 'watchlist' && !r.isExcluded && !r.isGloballyBlocked,
  )
  const removableSelected = selectedRows.filter((r) => r.isExcluded)

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

      {(excludableSelected.length > 0 || removableSelected.length > 0) && (
        <div className="flex items-center justify-start gap-2 flex-wrap">
          {onBulkExclude && excludableSelected.length > 0 && (
            <Button
              variant="bluenoShadow"
              size="sm"
              className="flex items-center gap-2 h-10"
              onClick={() => onBulkExclude(excludableSelected)}
            >
              <Edit className="h-4 w-4" />
              Bulk Exclude ({excludableSelected.length})
            </Button>
          )}
          {onBulkRemove && removableSelected.length > 0 && (
            <Button
              variant="error"
              size="sm"
              className="flex items-center gap-2 h-10"
              onClick={() => onBulkRemove(removableSelected)}
            >
              <Trash2 className="h-4 w-4" />
              Bulk Remove ({removableSelected.length})
            </Button>
          )}
        </div>
      )}

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
            column={table.getColumn('type')}
            title="Type"
            options={typeFilterOptions}
          />
          <DataTableFacetedFilter
            column={table.getColumn('status')}
            title="Status"
            options={statusFilterOptions}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="noShadow"
            aria-label="Refresh exclusions"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="noShadow">
                Columns <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
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
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
