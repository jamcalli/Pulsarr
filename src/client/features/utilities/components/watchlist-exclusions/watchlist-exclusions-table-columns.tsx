import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown, Ban, CheckCircle, Film, Loader2, Tv } from 'lucide-react'
import { createSelectColumn } from '@/components/table/data-table-select-column'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { useCreateWatchlistExclusion } from '@/features/utilities/hooks/useWatchlistExclusionMutations'

export interface WatchlistExclusionTableRow {
  title: string
  key: string
  type: string
  status: string
  added: string | null
  userId: number
  username: string
  id: string
  isExcluded: boolean
  exclusionId: number | null
}

interface WatchlistExclusionColumnsProps {
  onExclude: (row: WatchlistExclusionTableRow) => void
  createMutation: ReturnType<typeof useCreateWatchlistExclusion>
  globallyBlockedKeys: Set<string>
}

export function createWatchlistExclusionColumns({
  onExclude,
  createMutation,
  globallyBlockedKeys,
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
    },
    {
      accessorKey: 'username',
      header: () => <div>User</div>,
      cell: ({ row }) => (
        <div className="truncate max-w-37.5">{row.getValue('username')}</div>
      ),
      filterFn: (row, id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.getValue(id) as string)
      },
    },
    {
      // Hidden column used only for type filtering - not displayed in UI
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
        const status = row.getValue('status') as string
        const isGloballyBlocked = globallyBlockedKeys.has(row.original.key)
        return (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={status === 'pending' ? 'neutral' : 'default'}>
              {status}
            </Badge>
            {isGloballyBlocked && (
              <Badge variant="warn" title="Globally blocked for all users">
                Global
              </Badge>
            )}
          </div>
        )
      },
      sortingFn: (rowA, rowB) => {
        const statusOrder = ['pending', 'requested', 'grabbed', 'notified']
        const statusA = rowA.getValue('status') as string
        const statusB = rowB.getValue('status') as string
        return statusOrder.indexOf(statusA) - statusOrder.indexOf(statusB)
      },
      meta: {
        className: 'w-25',
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
      sortingFn: (rowA, rowB) => {
        const dateA = rowA.getValue('added') as string | null
        const dateB = rowB.getValue('added') as string | null
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return new Date(dateA).getTime() - new Date(dateB).getTime()
      },
    },
    {
      id: 'actions',
      accessorFn: (row) => row.isExcluded,
      header: ({ column }) => (
        <div className="flex justify-center">
          <Button
            variant="noShadow"
            size="sm"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="whitespace-nowrap"
          >
            Excluded
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ),
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.isExcluded ? 1 : 0
        const b = rowB.original.isExcluded ? 1 : 0
        return a - b
      },
      enableHiding: false,
      cell: ({ row }) => {
        if (row.original.isExcluded) {
          return (
            <div
              className="flex justify-center"
              title="Manage in Active Exclusions below"
            >
              <Badge variant="default" className="h-8 px-3">
                <CheckCircle className="h-4 w-4 mr-1" />
                Excluded
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
        className: 'w-35',
      },
    },
  ]
}
