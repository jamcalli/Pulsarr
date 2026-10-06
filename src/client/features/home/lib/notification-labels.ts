import type { ChartColor } from '@/lib/chart-colors'
import type { components } from '@/types/api.js'

type NotificationStats = components['schemas']['NotificationStats']

interface ChannelLabel {
  channel: string
  label: string
  color: ChartColor
}

interface TypeLabel {
  type: string
  label: string
  color: ChartColor
  webhookOnly: boolean
}

interface FamilyLabel {
  family: string
  label: string
  types: TypeLabel[]
}

export const NOTIFICATION_CHANNELS: ChannelLabel[] = [
  {
    channel: 'discord',
    label: 'Discord',
    color: 'chart-discord',
  },
  {
    channel: 'plex_mobile',
    label: 'Plex Mobile',
    color: 'chart-plex-mobile',
  },
  {
    channel: 'apprise',
    label: 'Apprise',
    color: 'chart-apprise',
  },
  {
    channel: 'native_webhook',
    label: 'Native webhook',
    color: 'chart-native-webhook',
  },
]

export const NOTIFICATION_FAMILIES: FamilyLabel[] = [
  {
    family: 'content',
    label: 'Content ready',
    types: [
      {
        type: 'movie',
        label: 'Movie available',
        color: 'chart-movie',
        webhookOnly: false,
      },
      {
        type: 'episode',
        label: 'New episode',
        color: 'chart-show',
        webhookOnly: false,
      },
      {
        type: 'season',
        label: 'New season',
        color: 'chart-season',
        webhookOnly: false,
      },
    ],
  },
  {
    family: 'watchlist',
    label: 'Watchlist',
    types: [
      {
        type: 'watchlist_add',
        label: 'Added to watchlist',
        color: 'chart-watchlist',
        webhookOnly: false,
      },
      {
        type: 'watchlist_removed',
        label: 'Removed from watchlist',
        color: 'chart-watchlist',
        webhookOnly: true,
      },
      {
        type: 'watchlist_cap',
        label: 'Watchlist cap reached',
        color: 'chart-error',
        webhookOnly: false,
      },
    ],
  },
  {
    family: 'approvals',
    label: 'Approvals',
    types: [
      {
        type: 'approval_resolved',
        label: 'Approval decided',
        color: 'chart-approval',
        webhookOnly: true,
      },
      {
        type: 'approval_auto',
        label: 'Auto approved',
        color: 'chart-approval',
        webhookOnly: true,
      },
    ],
  },
  {
    family: 'accounts',
    label: 'Accounts',
    types: [
      {
        type: 'user_created',
        label: 'New user',
        color: 'chart-account',
        webhookOnly: true,
      },
    ],
  },
]

export interface ChannelRow extends ChannelLabel {
  count: number
}

export interface TypeRow extends TypeLabel {
  count: number
}

export interface FamilyGroup {
  family: string
  label: string
  rows: TypeRow[]
  webhookOnly: boolean
}

/** Known channels in table order, then any channel the table does not know. */
export function channelRows(
  byChannel: NotificationStats['by_channel'],
): ChannelRow[] {
  const counts = new Map(byChannel.map((row) => [row.channel, row.count]))
  const known = NOTIFICATION_CHANNELS.map((channel) => ({
    ...channel,
    count: counts.get(channel.channel) ?? 0,
  }))
  const unknown = byChannel
    .filter(
      (row) =>
        !NOTIFICATION_CHANNELS.some((label) => label.channel === row.channel),
    )
    .map(
      (row): ChannelRow => ({
        channel: row.channel,
        label: row.channel,
        color: 'chart-1',
        count: row.count,
      }),
    )
  return [...known, ...unknown]
}

/** Types outside the table are dropped. `maxCount` is the largest single type count, the shared bar scale. */
export function groupNotificationTypes(byType: NotificationStats['by_type']): {
  families: FamilyGroup[]
  maxCount: number
} {
  const counts = new Map(byType.map((row) => [row.type, row.count]))
  const families = NOTIFICATION_FAMILIES.map((family) => {
    const rows = family.types.map((type) => ({
      ...type,
      count: counts.get(type.type) ?? 0,
    }))
    return {
      family: family.family,
      label: family.label,
      rows,
      webhookOnly: rows.every((row) => row.webhookOnly),
    }
  })
  const maxCount = Math.max(
    0,
    ...families.flatMap((family) => family.rows.map((row) => row.count)),
  )
  return { families, maxCount }
}
