import { SEASON_MONITORING_LABELS } from '@root/schemas/sonarr/season-monitoring.schema'
import type { ColumnDef } from '@tanstack/react-table'
import { AvatarStack } from '@/components/avatar-stack'
import { StatusPill } from '@/components/status-pill'
import {
  lastSession,
  type RollingShowRow,
  SHOW_SORT_VALUES,
  seasonLabel,
} from '@/features/library/lib/session-monitoring/rolling-shows'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatCount, formatRelative } from '@/lib/format'

function ViewersCell({ row }: { row: RollingShowRow }) {
  const { lookup } = useUserDirectory()
  const people = row.viewers.map((viewer) => {
    const username = viewer.plex_username ?? ''
    const { name, avatar } = lookup(username)
    return { username, name, avatar }
  })
  const [first] = people

  if (!first) return <span className="text-muted-foreground">None yet</span>
  const label =
    people.length === 1 ? first.name : formatCount(people.length, 'viewer')
  return (
    <div className="flex items-center gap-2">
      <AvatarStack people={people} />
      <span>{label}</span>
    </div>
  )
}

function LastActivityCell({ row }: { row: RollingShowRow }) {
  const last = lastSession(row)
  const when = last ? (
    <span>{formatRelative(new Date(last))}</span>
  ) : (
    <span className="text-muted-foreground">None yet</span>
  )
  return (
    <div className="flex items-center gap-2">
      {when}
      {row.inactive && <StatusPill tone="pending" label="Inactive" />}
    </div>
  )
}

const show: ColumnDef<RollingShowRow> = {
  id: 'show',
  accessorFn: SHOW_SORT_VALUES.show,
  header: 'Show',
  cell: ({ row }) => (
    <div className="flex min-w-0 flex-col">
      <span className="font-medium">{row.original.record.show_title}</span>
      <span className="text-muted-foreground">{row.original.instanceName}</span>
    </div>
  ),
}

const mode: ColumnDef<RollingShowRow> = {
  id: 'mode',
  accessorFn: SHOW_SORT_VALUES.mode,
  header: 'Mode',
  cell: ({ row }) =>
    SEASON_MONITORING_LABELS[row.original.record.monitoring_type],
}

const season: ColumnDef<RollingShowRow> = {
  id: 'season',
  accessorFn: SHOW_SORT_VALUES.season,
  header: 'Season',
  cell: ({ row }) => seasonLabel(row.original.record),
}

const viewers: ColumnDef<RollingShowRow> = {
  id: 'viewers',
  accessorFn: SHOW_SORT_VALUES.viewers,
  header: 'Viewers',
  sortDescFirst: true,
  cell: ({ row }) => <ViewersCell row={row.original} />,
}

const last: ColumnDef<RollingShowRow> = {
  id: 'last',
  accessorFn: SHOW_SORT_VALUES.last,
  header: 'Last activity',
  sortDescFirst: true,
  cell: ({ row }) => <LastActivityCell row={row.original} />,
}

/** Column ids match the page's sort keys. */
export const SHOWS_COLUMNS: ColumnDef<RollingShowRow>[] = [
  show,
  mode,
  season,
  viewers,
  last,
]

export const SHOWS_COLUMN_CLASSES: Partial<Record<string, string>> = {
  show: 'min-w-48 whitespace-normal',
  viewers: 'min-w-44',
  last: 'min-w-44',
}
