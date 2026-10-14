import type { ColumnDef } from '@tanstack/react-table'
import { cn } from 'cn'
import { InlineLink } from '@/components/inline-link'
import { StatusPill } from '@/components/status-pill'
import { UserAvatar } from '@/components/user-avatar'
import { QuotaUsageLines } from '@/features/users/components/plex-users/quota-usage-lines'
import {
  notificationChannels,
  type PlexUser,
  type PlexUserRow,
  USER_SORT_VALUES,
} from '@/features/users/lib/plex-users/user-rows'
import {
  RELATIONSHIP_LABELS,
  RELATIONSHIP_TONES,
} from '@/features/users/lib/relationship'
import { formatNumber } from '@/lib/format'
import { userPageHref } from '@/lib/navigation'
import { displayName } from '@/lib/user-naming'

function UserCell({ user }: { user: PlexUser }) {
  const name = displayName(user)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar name={name} avatar={user.avatar} />
      <div className="flex min-w-0 flex-col items-start">
        <InlineLink
          to={userPageHref(user.id)}
          onClick={(event) => event.stopPropagation()}
        >
          {name}
        </InlineLink>
        {user.alias && (
          <span className="text-muted-foreground">{user.name}</span>
        )}
      </div>
    </div>
  )
}

function OnOff({ on }: { on: boolean }) {
  return (
    <span className={cn(!on && 'text-muted-foreground')}>
      {on ? 'On' : 'Off'}
    </span>
  )
}

const user: ColumnDef<PlexUserRow> = {
  id: 'user',
  accessorFn: USER_SORT_VALUES.user,
  header: 'User',
  cell: ({ row }) => <UserCell user={row.original.user} />,
}

const relationship: ColumnDef<PlexUserRow> = {
  id: 'relationship',
  accessorFn: USER_SORT_VALUES.relationship,
  header: 'Relationship',
  cell: ({ row }) => {
    const status = row.original.user.friendStatus
    if (status === null) return null
    return (
      <StatusPill
        tone={RELATIONSHIP_TONES[status]}
        label={RELATIONSHIP_LABELS[status]}
      />
    )
  },
}

const watchlist: ColumnDef<PlexUserRow> = {
  id: 'watchlist',
  accessorFn: USER_SORT_VALUES.watchlist,
  header: 'Watchlist',
  sortDescFirst: true,
  cell: ({ row }) => (
    <span className="tabular-nums">
      {formatNumber(row.original.user.watchlist_count)}
    </span>
  ),
}

const sync: ColumnDef<PlexUserRow> = {
  id: 'sync',
  accessorFn: USER_SORT_VALUES.sync,
  header: 'Sync',
  cell: ({ row }) => <OnOff on={row.original.user.can_sync} />,
}

const approval: ColumnDef<PlexUserRow> = {
  id: 'approval',
  accessorFn: USER_SORT_VALUES.approval,
  header: 'Approval',
  cell: ({ row }) => <OnOff on={row.original.user.requires_approval} />,
}

const notifications: ColumnDef<PlexUserRow> = {
  id: 'notifications',
  accessorFn: USER_SORT_VALUES.notifications,
  sortDescFirst: true,
  header: 'Notifications',
  cell: ({ row }) => {
    const channels = notificationChannels(row.original.user)
    return channels ?? <span className="text-muted-foreground">None</span>
  },
}

const quotas: ColumnDef<PlexUserRow> = {
  id: 'quotas',
  accessorFn: USER_SORT_VALUES.quotas,
  sortDescFirst: true,
  header: 'Quotas',
  cell: ({ row }) => <QuotaUsageLines quotas={row.original.quotas} />,
}

/** Column ids match the page's sort keys. */
export const USERS_COLUMNS: ColumnDef<PlexUserRow>[] = [
  user,
  relationship,
  watchlist,
  sync,
  approval,
  notifications,
  quotas,
]

export const USERS_COLUMN_CLASSES: Partial<Record<string, string>> = {
  user: 'min-w-56 whitespace-normal',
  notifications: 'min-w-40 whitespace-normal',
  quotas: 'min-w-56 whitespace-normal',
}
