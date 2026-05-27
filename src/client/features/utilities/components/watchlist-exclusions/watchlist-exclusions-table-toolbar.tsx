import type { Table } from '@tanstack/react-table'
import {
  ChevronDown,
  Edit,
  Film,
  Loader2,
  RefreshCw,
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
  onBulkActions?: (selectedRows: WatchlistExclusionTableRow[]) => void
}

const typeFilterOptions = [
  { label: 'Movie', value: 'movie', icon: Film },
  { label: 'Show', value: 'show', icon: Tv },
]

export function WatchlistExclusionsTableToolbar({
  table,
  userFilterOptions,
  isFiltered,
  onResetFilters,
  isRefreshing,
  onRefresh,
  onBulkActions,
}: WatchlistExclusionsTableToolbarProps) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length

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

      {selectedCount > 0 && onBulkActions && (
        <div className="flex items-center justify-start gap-2">
          <Button
            variant="blue"
            size="sm"
            className="flex items-center gap-2 h-10"
            onClick={() =>
              onBulkActions(
                table.getFilteredSelectedRowModel().rows.map((r) => r.original),
              )
            }
          >
            <Edit className="h-4 w-4" />
            Bulk Actions ({selectedCount})
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {userFilterOptions.length > 0 && (
            <DataTableFacetedFilter
              column={table.getColumn('username')}
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
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
