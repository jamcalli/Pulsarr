import { ContentTypeSchema } from '@root/schemas/common/content-type.schema'
import type {
  UsersSortKey,
  UsersState,
} from '@/features/users/lib/plex-users/users-state'
import { RELATIONSHIP_ORDER } from '@/features/users/lib/relationship'
import { USER_SWITCH_LABELS } from '@/features/users/lib/user-switches'
import { CONTENT_TYPE_PLURAL_LABELS } from '@/lib/content-type'
import { compareSortValues, compareText, formatList } from '@/lib/format'
import { formatQuotaUsage, QUOTA_TYPE_LABELS } from '@/lib/quota'
import { displayName } from '@/lib/user-naming'
import type { components } from '@/types/api.js'

type ContentType = components['schemas']['ContentType']
type QuotaStatus = components['schemas']['UserQuotaStatus']

export type PlexUser = components['schemas']['UserWithCount']

export interface PlexUserRow {
  user: PlexUser
  quotas: Record<ContentType, QuotaStatus | null>
}

export interface QuotaLine {
  key: ContentType
  usage: string
  period: string
  atLimit: boolean
}

function channelLabels(user: PlexUser): string[] {
  return [
    user.notify_discord && USER_SWITCH_LABELS.notify_discord,
    user.notify_discord_mention && USER_SWITCH_LABELS.notify_discord_mention,
    user.notify_apprise && USER_SWITCH_LABELS.notify_apprise,
    user.notify_plex_mobile && USER_SWITCH_LABELS.notify_plex_mobile,
  ].filter((channel) => channel !== false)
}

/** Null when no channel is on. */
export function notificationChannels(user: PlexUser): string | null {
  const channels = channelLabels(user)
  return channels.length > 0 ? formatList(channels) : null
}

/** The highest share of any quota used, or -1 without quotas. */
function quotaShare(quotas: PlexUserRow['quotas']): number {
  return Math.max(
    -1,
    ...ContentTypeSchema.options.map((key) => {
      const status = quotas[key]
      if (!status) return -1
      return status.quotaLimit > 0 ? status.currentUsage / status.quotaLimit : 0
    }),
  )
}

/** Each column's sort value, in ascending order. */
export const USER_SORT_VALUES: Record<
  UsersSortKey,
  (row: PlexUserRow) => string | number
> = {
  user: (row) => displayName(row.user),
  relationship: (row) =>
    row.user.friendStatus === null
      ? Object.keys(RELATIONSHIP_ORDER).length
      : RELATIONSHIP_ORDER[row.user.friendStatus],
  watchlist: (row) => row.user.watchlist_count,
  sync: (row) => (row.user.can_sync ? 0 : 1),
  approval: (row) => (row.user.requires_approval ? 0 : 1),
  notifications: (row) => channelLabels(row.user).length,
  quotas: (row) => quotaShare(row.quotas),
}

export function quotaLines(quotas: PlexUserRow['quotas']): QuotaLine[] {
  return ContentTypeSchema.options.flatMap((key) => {
    const status = quotas[key]
    if (!status) return []
    return [
      {
        key,
        usage: `${CONTENT_TYPE_PLURAL_LABELS[key]} ${formatQuotaUsage(status.currentUsage, status.quotaLimit)}`,
        period: QUOTA_TYPE_LABELS[status.quotaType],
        atLimit: status.exceeded,
      },
    ]
  })
}

function matches(user: PlexUser, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return [user.name, user.alias, user.display_name].some((value) =>
    value?.toLowerCase().includes(needle),
  )
}

function toggleMatches(filter: UsersState['sync'], value: boolean): boolean {
  return filter === null || (filter === 'on') === value
}

function compareRows(sort: UsersSortKey) {
  const value = USER_SORT_VALUES[sort]
  return (a: PlexUserRow, b: PlexUserRow) =>
    compareSortValues(value(a), value(b)) ||
    compareText(displayName(a.user), displayName(b.user)) ||
    compareText(a.user.name, b.user.name)
}

export function visibleRows(
  rows: readonly PlexUserRow[],
  state: UsersState,
): PlexUserRow[] {
  const direction = state.dir === 'desc' ? -1 : 1
  const compare = compareRows(state.sort)
  return rows
    .filter(
      ({ user }) =>
        matches(user, state.q) &&
        (state.rel === null || user.friendStatus === state.rel) &&
        toggleMatches(state.sync, user.can_sync) &&
        toggleMatches(state.appr, user.requires_approval),
    )
    .sort((a, b) => compare(a, b) * direction)
}
