import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  DirectMessage,
  DiscordEmbed,
  DiscordWebhookPayload,
} from '@root/types/discord.types.js'
import type {
  MediaNotification,
  UpdateAvailableRelease,
  WatchlistCapNotification,
} from '@root/types/notification.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import { pluralize } from '@root/utils/pluralize.js'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import {
  type DeleteSyncSection,
  sectionEmptyText,
  summarizeDeleteSync,
} from './delete-sync-summary.js'
import {
  EVENT_LABELS,
  formatTriggerReason,
  MEDIA_AVAILABLE_HEADINGS,
  mediaTypeLabel,
  TEST_NOTIFICATION,
  userLabel,
  WATCHLIST_CAP_IMPACT,
  WATCHLIST_CAP_TITLE,
} from './labels.js'
import { summarizeMediaAvailable } from './media-available.js'

const EMBED_COLOR = 0x48a9a6

const COLOR_RED = 0xff0000

const COLOR_GREEN = 0x00ff00

const COLOR_APPROVAL = 0xff9500

const COLOR_WATCHLIST_CAP = 0xffbf00

const PULSARR_AVATAR_URL =
  'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png'

const WEBHOOK_SENDER_NAMES = {
  default: 'Pulsarr',
  approval: 'Pulsarr Approvals',
  deleteSync: 'Pulsarr Delete Sync',
  updateAvailable: 'Pulsarr Updates',
  watchlistCap: 'Pulsarr Watchlist',
} as const

type WebhookSender = keyof typeof WEBHOOK_SENDER_NAMES

export function createWebhookPayload(
  sender: WebhookSender,
  embed: DiscordEmbed,
): DiscordWebhookPayload {
  return {
    embeds: [embed],
    username: WEBHOOK_SENDER_NAMES[sender],
    avatar_url: PULSARR_AVATAR_URL,
  }
}

const EMBED_TITLE_MAX = 256
const EMBED_FIELD_MAX = 1024
const EMBED_DESCRIPTION_MAX = 4096
const DELETE_SYNC_ITEM_MAX = 90

type EmbedField = { name: string; value: string; inline?: boolean }

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text
}

function tmdbField(url: string): EmbedField {
  return {
    name: 'More Info',
    value: `[View on TMDB](${url})`,
    inline: true,
  }
}

function mediaAvailableTitle(notification: MediaNotification): string {
  const { availability } = summarizeMediaAvailable(notification)
  return truncate(
    `${MEDIA_AVAILABLE_HEADINGS[availability]}: ${notification.title}`,
    EMBED_TITLE_MAX,
  )
}

export function createMediaNotificationEmbed(
  notification: MediaNotification,
): DiscordEmbed {
  const { details } = summarizeMediaAvailable(notification)

  const fields: EmbedField[] = details.map((detail) => ({
    name: detail.label,
    value: truncate(detail.value, EMBED_FIELD_MAX),
    inline: detail.inline,
  }))

  if (notification.tmdbUrl) {
    fields.push(tmdbField(notification.tmdbUrl))
  }

  const embed: DiscordEmbed = {
    title: mediaAvailableTitle(notification),
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    fields,
  }

  if (notification.posterUrl) {
    embed.image = {
      url: notification.posterUrl,
    }
  }

  return embed
}

export function createPublicMediaWebhookPayload(
  notification: MediaNotification,
  mentionDiscordIds: string[],
): DiscordWebhookPayload {
  const mentions = mentionDiscordIds.map((id) => `<@${id}>`).join(' ')
  return {
    content: mentions ? `${mentions} ${mediaAvailableTitle(notification)}` : '',
    ...createWebhookPayload(
      'default',
      createMediaNotificationEmbed(notification),
    ),
  }
}

export function createMediaAddedEmbed(
  notification: MediaNotification,
  displayName: string,
): DiscordEmbed {
  const { label } = mediaTypeLabel(notification.type)

  const embed: DiscordEmbed = {
    title: truncate(
      `${EVENT_LABELS.watchlistAdded}: ${notification.title}`,
      EMBED_TITLE_MAX,
    ),
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    footer: {
      text: `Added by ${displayName}`,
    },
    fields: [
      {
        name: 'Type',
        value: label,
        inline: true,
      },
    ],
  }

  if (notification.tmdbUrl && embed.fields) {
    embed.fields.push(tmdbField(notification.tmdbUrl))
  }

  if (notification.posterUrl) {
    embed.image = {
      url: notification.posterUrl,
    }
  }

  return embed
}

export function createTestEmbed(): DiscordEmbed {
  return {
    title: TEST_NOTIFICATION.title,
    description: TEST_NOTIFICATION.body,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
  }
}

export function createTestWebhookPayload(): DiscordWebhookPayload {
  return createWebhookPayload('default', createTestEmbed())
}

function deleteSyncFields(section: DeleteSyncSection): EmbedField[] {
  if (section.deleted <= 0) {
    return [
      {
        name: section.label,
        value: sectionEmptyText(section),
        inline: false,
      },
    ]
  }

  const list = section.shown
    .map((title) => `• ${truncate(title, DELETE_SYNC_ITEM_MAX)}`)
    .join('\n')

  const fields: EmbedField[] = [
    {
      name: `${section.label} (${section.meta})`,
      value: list || 'None',
      inline: false,
    },
  ]

  if (section.remaining > 0) {
    fields.push({
      name: `${section.label} (continued)`,
      value: `... and ${section.remaining} more`,
      inline: false,
    })
  }

  return fields
}

export function createDeleteSyncEmbed(
  results: DeleteSyncResult,
  dryRun: boolean,
): DiscordEmbed {
  const summary = summarizeDeleteSync(results, dryRun)

  const description = [summary.summaryText, summary.protectedText]
    .filter(Boolean)
    .join('\n\n')

  const fields: EmbedField[] = [
    {
      name: 'Summary',
      value: `Processed: ${summary.totals.processed} items\nDeleted: ${summary.totals.deleted} items\nSkipped: ${summary.totals.skipped} items${summary.totals.protected ? `\nProtected: ${summary.totals.protected} items` : ''}`,
      inline: false,
    },
  ]

  if (summary.safetyMessage) {
    fields.push({
      name: 'Safety Reason',
      value: truncate(summary.safetyMessage, EMBED_FIELD_MAX),
      inline: false,
    })
  }

  fields.push(
    ...deleteSyncFields(summary.movies),
    ...deleteSyncFields(summary.shows),
  )

  return {
    title: summary.title,
    description: description
      ? truncate(description, EMBED_DESCRIPTION_MAX)
      : undefined,
    color: results.safetyTriggered === true ? COLOR_RED : COLOR_GREEN,
    timestamp: new Date().toISOString(),
    fields,
    footer: {
      text: `Delete sync operation completed at ${new Date().toLocaleString()}`,
    },
  }
}

export function createUpdateAvailableEmbed(
  release: Omit<UpdateAvailableRelease, 'releaseBodyHtml'>,
): DiscordEmbed {
  const displayName = release.releaseName?.trim() || `v${release.latestVersion}`
  const body = release.releaseBody?.trim() ?? ''

  const versionLine = `**Current:** v${release.currentVersion}\n**Latest:** v${release.latestVersion}\n\n`
  const truncatedBody = truncate(
    body,
    EMBED_DESCRIPTION_MAX - versionLine.length,
  )

  const description = truncatedBody
    ? `${versionLine}${truncatedBody}`
    : `${versionLine}_No release notes provided._`

  const fields: EmbedField[] = []

  if (release.publishedAt) {
    fields.push({
      name: 'Published',
      value: new Date(release.publishedAt).toLocaleDateString(),
      inline: true,
    })
  }

  fields.push({
    name: 'Release',
    value: `[View on GitHub](${release.releaseUrl})`,
    inline: true,
  })

  return {
    title: truncate(
      `${EVENT_LABELS.updateAvailable}: ${displayName}`,
      EMBED_TITLE_MAX,
    ),
    url: release.releaseUrl,
    description,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    fields,
    footer: {
      text: 'Pulsarr update notification',
    },
  }
}

interface SystemDmContent {
  title: string
  fields: EmbedField[]
  safetyTriggered?: boolean
  tmdbUrl?: string
  button?: { label: string; customId: string }
}

export function createSystemDm(content: SystemDmContent): DirectMessage {
  const fields = content.tmdbUrl
    ? [...content.fields, tmdbField(content.tmdbUrl)]
    : content.fields

  const embed: DiscordEmbed = {
    title: truncate(content.title, EMBED_TITLE_MAX),
    description: 'System notification',
    color: content.safetyTriggered === true ? COLOR_RED : COLOR_GREEN,
    timestamp: new Date().toISOString(),
    fields,
  }
  if (!content.button) return { embed }

  const button = new ButtonBuilder()
    .setCustomId(content.button.customId)
    .setLabel(content.button.label)
    .setStyle(ButtonStyle.Primary)
  return {
    embed,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  }
}

export function createApprovalRequestEmbed(
  request: ApprovalRequest,
  totalPending: number,
  posterUrl?: string,
): DiscordEmbed {
  const tmdbUrl = getTmdbUrl(request.contentGuids, request.contentType)

  const fields: EmbedField[] = [
    {
      name: 'Requested by',
      value: userLabel(request.userName, request.userId),
      inline: true,
    },
    {
      name: 'Pending requests',
      value: `${totalPending} awaiting review`,
      inline: true,
    },
    {
      name: 'Reason for approval',
      value: formatTriggerReason(request.triggeredBy, request.approvalReason),
      inline: false,
    },
  ]

  if (tmdbUrl) {
    fields.push(tmdbField(tmdbUrl))
  }

  const embed: DiscordEmbed = {
    title: truncate(
      `${EVENT_LABELS.approvalRequest}: ${request.contentTitle}`,
      EMBED_TITLE_MAX,
    ),
    description: `**${request.contentTitle}** (${mediaTypeLabel(request.contentType).label})`,
    color: COLOR_APPROVAL,
    timestamp: new Date().toISOString(),
    fields,
    footer: {
      text: `Request ID: ${request.id}`,
    },
  }

  if (posterUrl) {
    embed.image = { url: posterUrl }
  }

  return embed
}

const APPROVAL_EXAMPLE_LIMIT = 3

function countLabel(count: number, noun: string): string {
  return `${count} ${pluralize(count, noun)}`
}

function approvalBatchFields(requests: ApprovalRequest[]): EmbedField[] {
  if (requests.length === 1) {
    const [request] = requests
    return [
      {
        name: 'Latest Request',
        value: `${request.contentTitle} (${mediaTypeLabel(request.contentType).label})`,
        inline: false,
      },
      {
        name: 'Requested by',
        value: userLabel(request.userName, request.userId),
        inline: true,
      },
      {
        name: 'Reason for approval',
        value: formatTriggerReason(request.triggeredBy, request.approvalReason),
        inline: false,
      },
    ]
  }

  const movieCount = requests.filter((r) => r.contentType === 'movie').length
  const showCount = requests.filter((r) => r.contentType === 'show').length
  const contentSummary = [
    ...(movieCount > 0 ? [countLabel(movieCount, 'movie')] : []),
    ...(showCount > 0 ? [countLabel(showCount, 'show')] : []),
  ]

  const exampleTitles = requests
    .slice(0, APPROVAL_EXAMPLE_LIMIT)
    .map((r) => `• ${r.contentTitle}`)
    .join('\n')
  const moreText =
    requests.length > APPROVAL_EXAMPLE_LIMIT
      ? `\n... and ${requests.length - APPROVAL_EXAMPLE_LIMIT} more`
      : ''

  return [
    {
      name: 'New Requests',
      value: `${contentSummary.join(' and ')} added to queue`,
      inline: false,
    },
    {
      name: 'Recent Requests',
      value: exampleTitles + moreText,
      inline: false,
    },
  ]
}

/** Expects at least one request. */
export function createApprovalBatchDm(
  requests: ApprovalRequest[],
  totalPending: number,
): DirectMessage {
  const isMultiple = requests.length > 1
  const [first] = requests

  return createSystemDm({
    title: isMultiple
      ? `${pluralize(requests.length, EVENT_LABELS.approvalRequest)}: ${requests.length} new`
      : `${EVENT_LABELS.approvalRequest}: ${first.contentTitle}`,
    fields: [
      {
        name: 'Pending Approvals',
        value: `${totalPending} awaiting review`,
        inline: false,
      },
      { name: '\u200b', value: '\u200b', inline: false },
      ...approvalBatchFields(requests),
    ],
    tmdbUrl: isMultiple
      ? undefined
      : getTmdbUrl(first.contentGuids, first.contentType),
    button: {
      label: 'Review Approvals',
      customId: `review_approvals_${Date.now()}`,
    },
  })
}

function watchlistCapFields(event: WatchlistCapNotification): EmbedField[] {
  return [
    {
      name: 'User',
      value: userLabel(event.userName, event.userId),
      inline: true,
    },
    {
      name: 'Content Type',
      value: mediaTypeLabel(event.contentType).label,
      inline: true,
    },
    {
      name: 'Usage',
      value: `${event.currentCount} / ${event.cap}`,
      inline: true,
    },
  ]
}

export function createWatchlistCapEmbed(
  event: WatchlistCapNotification,
): DiscordEmbed {
  const contentLabel = mediaTypeLabel(event.contentType).label.toLowerCase()

  return {
    title: truncate(
      `${WATCHLIST_CAP_TITLE}: ${userLabel(event.userName, event.userId)}`,
      EMBED_TITLE_MAX,
    ),
    description: `**${userLabel(event.userName, event.userId)}** reached their ${contentLabel} cap (${event.currentCount}/${event.cap})`,
    color: COLOR_WATCHLIST_CAP,
    timestamp: new Date().toISOString(),
    fields: watchlistCapFields(event),
    footer: {
      text: WATCHLIST_CAP_IMPACT,
    },
  }
}

export function createWatchlistCapDm(
  event: WatchlistCapNotification,
): DirectMessage {
  return createSystemDm({
    title: `${WATCHLIST_CAP_TITLE}: ${userLabel(event.userName, event.userId)}`,
    fields: [
      ...watchlistCapFields(event),
      { name: 'Impact', value: WATCHLIST_CAP_IMPACT, inline: false },
    ],
  })
}

export function createUserWatchlistCapDm(
  event: WatchlistCapNotification,
  displayName: string,
): DirectMessage {
  const contentLabel = mediaTypeLabel(event.contentType).label.toLowerCase()

  return createSystemDm({
    title: WATCHLIST_CAP_TITLE,
    fields: [
      {
        name: 'Notice',
        value: `${displayName}, you've reached your ${contentLabel} watchlist cap (${event.currentCount}/${event.cap}). New ${contentLabel} items won't be processed until the cap is raised or existing items are removed.`,
        inline: false,
      },
    ],
  })
}
