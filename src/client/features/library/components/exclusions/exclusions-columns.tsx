import type { ColumnDef } from '@tanstack/react-table'
import { Ellipsis } from 'lucide-react'
import { PosterFrame } from '@/components/poster-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SingleTarget } from '@/features/library/hooks/exclusions/useExclusionActions'
import { lastExcludedAt } from '@/features/library/lib/exclusions/exclusion-rows'
import { CONTENT_TYPE_LABELS } from '@/lib/content-type'
import { formatNumber, formatRelative } from '@/lib/format'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']

function TitleCell({ item }: { item: ExclusionItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PosterFrame size="thumb" thumb={item.thumb} type={item.type} />
      <div className="flex min-w-0 flex-col items-start">
        <span className="font-medium break-words">{item.title}</span>
        <span className="text-muted-foreground">
          {CONTENT_TYPE_LABELS[item.type]}
        </span>
      </div>
    </div>
  )
}

function ExcludedCell({ item }: { item: ExclusionItem }) {
  if (item.globalExclusion) return <Badge variant="warn">Everyone</Badge>
  return (
    <span className="tabular-nums">
      {formatNumber(item.excludedCount)} of{' '}
      {formatNumber(item.watchlisterCount)}
    </span>
  )
}

function LastExcludedCell({ item }: { item: ExclusionItem }) {
  const last = lastExcludedAt(item)
  if (last === null) return <span className="text-muted-foreground">Never</span>
  return formatRelative(new Date(last))
}

interface RowMenuProps {
  item: ExclusionItem
  locked: boolean
  onAction: (target: SingleTarget) => void
}

function RowMenu({ item, locked, onAction }: RowMenuProps) {
  const global = item.globalExclusion
  const menuItem = global ? (
    <DropdownMenuItem
      onClick={(event) => {
        event.stopPropagation()
        onAction({ kind: 'removeGlobal', item, id: global.id })
      }}
    >
      Remove global exclusion
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem
      onClick={(event) => {
        event.stopPropagation()
        onAction({ kind: 'excludeGlobal', item })
      }}
    >
      Exclude for everyone
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${item.title}`}
            disabled={locked}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {menuItem}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const title: ColumnDef<ExclusionItem> = {
  id: 'title',
  header: 'Title',
  accessorFn: (row) => row.title,
  cell: ({ row }) => <TitleCell item={row.original} />,
}

const watchlisters: ColumnDef<ExclusionItem> = {
  id: 'watchlisters',
  header: 'Watchlisters',
  accessorFn: (row) => row.watchlisterCount,
  sortDescFirst: true,
  cell: ({ row }) => (
    <span className="tabular-nums">
      {formatNumber(row.original.watchlisterCount)}
    </span>
  ),
}

const excluded: ColumnDef<ExclusionItem> = {
  id: 'excluded',
  header: 'Excluded',
  accessorFn: (row) => row.excludedCount,
  sortDescFirst: true,
  cell: ({ row }) => <ExcludedCell item={row.original} />,
}

const excludedAt: ColumnDef<ExclusionItem> = {
  id: 'excludedAt',
  header: 'Last excluded',
  accessorFn: lastExcludedAt,
  sortDescFirst: true,
  cell: ({ row }) => <LastExcludedCell item={row.original} />,
}

/** Column ids match the items query's sort keys, so build it once per `locked` and `onAction`. */
export function exclusionsColumns(
  locked: boolean,
  onAction: (target: SingleTarget) => void,
): ColumnDef<ExclusionItem>[] {
  return [
    title,
    watchlisters,
    excluded,
    excludedAt,
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <RowMenu item={row.original} locked={locked} onAction={onAction} />
      ),
    },
  ]
}

export const EXCLUSIONS_COLUMN_CLASSES: Partial<Record<string, string>> = {
  title: 'min-w-56 whitespace-normal',
  actions: 'w-12',
}
