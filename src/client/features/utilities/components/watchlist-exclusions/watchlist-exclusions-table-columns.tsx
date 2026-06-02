import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowUpDown,
  Ban,
  CheckCircle,
  Film,
  Loader2,
  Trash2,
  Tv,
} from 'lucide-react'
import { createSelectColumn } from '@/components/table/data-table-select-column'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type {
  useCreateWatchlistExclusion,
  useRemoveWatchlistExclusion,
} from '@/features/utilities/hooks/useWatchlistExclusionMutations'

export type WatchlistExclusionRowKind = 'watchlist' | 'global' | 'orphan-user'

export const GLOBAL_USER_LABEL = 'Global'

export interface WatchlistExclusionTableRow {
  id: string
  rowKind: WatchlistExclusionRowKind
  title: string
  key: string
  type: string
  status: string | null
  added: string | null
  excluded_at: string | null
  guids: string[]
  userId: number
  username: string
  isExcluded: boolean
  exclusionId: number | null
  isGloballyBlocked: boolean
}

interface WatchlistExclusionColumnsProps {
  onExclude: (row: WatchlistExclusionTableRow) => void
  onRemove: (row: WatchlistExclusionTableRow) => void
  createMutation: ReturnType<typeof useCreateWatchlistExclusion>
  removeMutation: ReturnType<typeof useRemoveWatchlistExclusion>
}

const statusBadgeOrder = ['pending', 'requested', 'grabbed', 'notified']

function dateTimeOrNegInfinity(value: string | null): number {
  return value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY
}

export function createWatchlistExclusionColumns({
  onExclude,
  onRemove,
  createMutation,
  removeMutation,
}: WatchlistExclusionColumnsProps): ColumnDef<WatchlistExclusionTableRow>[] {
  return [
    createSelectColumn<WatchlistExclusionTableRow>({
      meta: { className: 'w-10', headerClassName: 'w-10' },
    }),
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const type = row.original.type
        const Icon = type === 'movie' ? Film : Tv
        return (
          <div className="flex items-center gap-2 max-w-xs">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="truncate">
              <div className="font-medium truncate">
                {row.getValue('title')}
              </div>
              <div className="text-sm text-muted-foreground capitalize">
                {type}
              </div>
            </div>
          </div>
        )
      },
      meta: {
        displayName: 'Title',
      },
    },
    {
      accessorKey: 'username',
      header: () => <div>User</div>,
      cell: ({ row }) => {
        if (row.original.rowKind === 'global') {
          return (
            <Badge variant="warn" title="Globally blocked for all users">
              Global
            </Badge>
          )
        }
        return (
          <div className="truncate max-w-37.5">{row.getValue('username')}</div>
        )
      },
      enableColumnFilter: false,
      meta: {
        displayName: 'User',
      },
    },
    {
      id: 'userId',
      accessorFn: (row) => String(row.userId),
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableHiding: false,
      size: 0,
      minSize: 0,
      maxSize: 0,
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
      },
    },
    {
      accessorKey: 'type',
      id: 'type',
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableHiding: false,
      size: 0,
      minSize: 0,
      maxSize: 0,
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.original.status
        const showGlobalBadge =
          row.original.rowKind === 'watchlist' &&
          row.original.isGloballyBlocked &&
          row.original.isExcluded
        return (
          <div className="flex flex-wrap items-center gap-1">
            {status ? (
              <Badge variant={status === 'pending' ? 'neutral' : 'default'}>
                {status}
              </Badge>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
            {showGlobalBadge && (
              <Badge variant="warn" title="Globally blocked for all users">
                Global
              </Badge>
            )}
          </div>
        )
      },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.status
        const b = rowB.original.status
        const ia = a ? statusBadgeOrder.indexOf(a) : -1
        const ib = b ? statusBadgeOrder.indexOf(b) : -1
        return ia - ib
      },
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        const status = row.getValue(id) as string | null
        return status !== null && filterValue.includes(status)
      },
      meta: {
        className: 'w-25',
        displayName: 'Status',
      },
    },
    {
      accessorKey: 'added',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Added
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const added = row.getValue('added') as string | null
        if (!added) return <span className="text-muted-foreground">-</span>

        const date = new Date(added)
        return (
          <span className="text-sm text-muted-foreground">
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )
      },
      sortingFn: (rowA, rowB) =>
        dateTimeOrNegInfinity(rowA.getValue('added') as string | null) -
        dateTimeOrNegInfinity(rowB.getValue('added') as string | null),
      meta: {
        displayName: 'Added',
      },
    },
    {
      accessorKey: 'excluded_at',
      header: ({ column }) => (
        <Button
          variant="noShadow"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="whitespace-nowrap"
        >
          Excluded
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const excludedAt = row.getValue('excluded_at') as string | null
        if (!excludedAt) return <span className="text-muted-foreground">-</span>

        const date = new Date(excludedAt)
        return (
          <span className="text-sm text-muted-foreground">
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )
      },
      sortingFn: (rowA, rowB) =>
        dateTimeOrNegInfinity(rowA.getValue('excluded_at') as string | null) -
        dateTimeOrNegInfinity(rowB.getValue('excluded_at') as string | null),
      meta: {
        displayName: 'Excluded',
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <div className="flex justify-center">Actions</div>,
      cell: ({ row }) => {
        if (row.original.isExcluded) {
          const isRemoving =
            removeMutation.isPending &&
            removeMutation.variables === row.original.exclusionId
          return (
            <div className="flex justify-center items-center gap-1">
              <Badge variant="default" className="h-8 px-3">
                <CheckCircle className="h-4 w-4 mr-1" />
                Excluded
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="error"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onRemove(row.original)}
                    disabled={isRemoving || row.original.exclusionId === null}
                    aria-label="Remove exclusion"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove exclusion</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )
        }

        if (
          row.original.rowKind === 'watchlist' &&
          row.original.isGloballyBlocked
        ) {
          return (
            <div className="flex justify-center">
              <Badge
                variant="warn"
                className="h-8 px-3"
                title="Blocked by a global exclusion. Remove it from the Global row."
              >
                <Ban className="h-4 w-4 mr-1" />
                Excluded globally
              </Badge>
            </div>
          )
        }

        const isExcluding =
          createMutation.isPending &&
          createMutation.variables?.key === row.original.key &&
          createMutation.variables?.userIds.includes(row.original.userId)

        return (
          <div className="flex justify-center">
            <Button
              variant="noShadow"
              size="sm"
              className="h-8"
              onClick={() => onExclude(row.original)}
              disabled={isExcluding}
            >
              {isExcluding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              <span className="ml-1">
                {isExcluding ? 'Excluding...' : 'Exclude'}
              </span>
            </Button>
          </div>
        )
      },
      meta: {
        className: 'w-44',
      },
    },
  ]
}
