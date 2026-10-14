import { ContentTypeSchema } from '@root/schemas/common/content-type.schema'
import type { UsersState } from '@/features/users/lib/plex-users/users-state'
import { USER_SWITCH_LABELS } from '@/features/users/lib/user-switches'
import { CONTENT_TYPE_PLURAL_LABELS } from '@/lib/content-type'
import { compareText, formatList } from '@/lib/format'
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

/** Null when no channel is on. */
export function notificationChannels(user: PlexUser): string | null {
  const channels = [
    user.notify_discord && USER_SWITCH_LABELS.notify_discord,
    user.notify_discord_mention && USER_SWITCH_LABELS.notify_discord_mention,
    user.notify_apprise && USER_SWITCH_LABELS.notify_apprise,
    user.notify_plex_mobile && USER_SWITCH_LABELS.notify_plex_mobile,
  ].filter((channel) => channel !== false)
  return channels.length > 0 ? formatList(channels) : null
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

function compareRows(sort: UsersState['sort']) {
  return (a: PlexUserRow, b: PlexUserRow) =>
    sort === 'watchlist'
      ? a.user.watchlist_count - b.user.watchlist_count
      : compareText(displayName(a.user), displayName(b.user)) ||
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
