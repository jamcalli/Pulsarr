import type { GetRoutingFailuresResponse } from '@root/schemas/routing-failures/routing-failures.schema'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown, Film, Loader2, RotateCw, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ROUTING_FAILURE_CATEGORY_META,
  RoutingFailureCategoryBadge,
} from '@/features/requests/components/routing-failures/routing-failure-category-badge'

export type RoutingFailureRow = GetRoutingFailuresResponse['failures'][number]

interface RoutingFailureColumnsProps {
  onRetry: (row: RoutingFailureRow) => void
  retryingItemId: number | null
  /** Retries run one at a time on the server, so rows wait for a running Retry All. */
  isRetryingAll: boolean
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sortableHeader(label: string) {
  return ({
    column,
  }: {
    column: {
      toggleSorting: (desc?: boolean) => void
      getIsSorted: () => false | 'asc' | 'desc'
    }
  }) => (
    <Button
      variant="noShadow"
      size="sm"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className="whitespace-nowrap"
    >
      {label}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  )
}

const includesFilter = (
  row: { getValue: (id: string) => unknown },
  id: string,
  filterValue: string[],
) => !filterValue?.length || filterValue.includes(String(row.getValue(id)))

export function createRoutingFailureColumns({
  onRetry,
  retryingItemId,
  isRetryingAll,
}: RoutingFailureColumnsProps): ColumnDef<RoutingFailureRow>[] {
  return [
    {
      accessorKey: 'title',
      header: sortableHeader('Title'),
      cell: ({ row }) => {
        const Icon = row.original.type === 'movie' ? Film : Tv
        return (
          <div className="flex items-center gap-2 max-w-xs">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="truncate">
              <div className="font-medium truncate">{row.original.title}</div>
              <div className="text-sm text-muted-foreground capitalize">
                {row.original.type}
              </div>
            </div>
          </div>
        )
      },
      meta: { displayName: 'Title' },
    },
    {
      accessorKey: 'username',
      header: () => <div>User</div>,
      cell: ({ row }) => (
        <div className="truncate max-w-37.5">{row.original.username}</div>
      ),
      meta: { displayName: 'User' },
    },
    {
      id: 'userId',
      accessorFn: (row) => String(row.user_id),
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableHiding: false,
      filterFn: includesFilter,
    },
    {
      accessorKey: 'category',
      header: sortableHeader('Reason'),
      cell: ({ row }) => (
        <RoutingFailureCategoryBadge category={row.original.category} />
      ),
      filterFn: includesFilter,
      meta: { displayName: 'Reason' },
    },
    {
      id: 'instance',
      accessorFn: (row) =>
        row.instance_id === null
          ? ''
          : (row.instance_name ?? `#${row.instance_id}`),
      header: () => <div>Instance</div>,
      cell: ({ row }) => {
        const { instance_id, instance_name } = row.original
        if (instance_id === null) {
          return <span className="text-muted-foreground">-</span>
        }
        return (
          <div className="truncate max-w-37.5">
            {instance_name ?? `#${instance_id}`}
          </div>
        )
      },
      meta: { displayName: 'Instance' },
    },
    {
      accessorKey: 'message',
      header: () => <div>Details</div>,
      cell: ({ row }) => {
        const lowSeverity =
          ROUTING_FAILURE_CATEGORY_META[row.original.category].lowSeverity
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`truncate max-w-56 text-sm ${lowSeverity ? 'text-muted-foreground' : ''}`}
              >
                {row.original.message || '-'}
              </div>
            </TooltipTrigger>
            {row.original.message && (
              <TooltipContent className="max-w-md">
                <p className="break-words">{row.original.message}</p>
              </TooltipContent>
            )}
          </Tooltip>
        )
      },
      meta: { displayName: 'Details' },
    },
    {
      accessorKey: 'attempt_count',
      header: () => <div className="text-center">Attempts</div>,
      cell: ({ row }) => (
        <div
          className="text-center font-medium"
          title={`First failed ${formatDateTime(row.original.first_failed_at)}`}
        >
          {row.original.attempt_count}
        </div>
      ),
      meta: { displayName: 'Attempts' },
    },
    {
      accessorKey: 'last_failed_at',
      header: sortableHeader('Last Failed'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.last_failed_at)}
        </span>
      ),
      sortingFn: (rowA, rowB) =>
        new Date(rowA.original.last_failed_at).getTime() -
        new Date(rowB.original.last_failed_at).getTime(),
      meta: { displayName: 'Last Failed' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <div className="flex justify-center">Actions</div>,
      cell: ({ row }) => {
        // a retry cannot give an item the IDs it lacks
        if (ROUTING_FAILURE_CATEGORY_META[row.original.category].lowSeverity) {
          return (
            <div className="flex justify-center text-muted-foreground">-</div>
          )
        }
        const isRetrying = retryingItemId === row.original.watchlist_item_id
        return (
          <div className="flex justify-center">
            <Button
              variant="noShadow"
              size="sm"
              className="h-8"
              onClick={() => onRetry(row.original)}
              disabled={retryingItemId !== null || isRetryingAll}
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              <span className="ml-1">
                {isRetrying ? 'Retrying...' : 'Retry'}
              </span>
            </Button>
          </div>
        )
      },
      meta: { className: 'w-32' },
    },
  ]
}
