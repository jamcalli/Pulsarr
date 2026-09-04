import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  DiscordEmbed,
  DiscordWebhookPayload,
  MediaNotification,
  UpdateAvailableRelease,
} from '@root/types/discord.types.js'
import {
  type DeleteSyncSection,
  summarizeDeleteSync,
} from './delete-sync-summary.js'
import { mediaTypeLabel } from './media-type.js'
import { isSafetyNotification } from './system-notification.js'

export const EMBED_COLOR = 0x48a9a6

export const COLOR_RED = 0xff0000

export const COLOR_GREEN = 0x00ff00

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

export function createMediaNotificationEmbed(
  notification: MediaNotification,
): DiscordEmbed {
  const emoji = notification.type === 'movie' ? '🎬' : '📺'
  let description: string
  const fields: EmbedField[] = []

  if (notification.type === 'show' && notification.episodeDetails) {
    const { episodeDetails } = notification

    if (
      episodeDetails.episodeNumber !== undefined &&
      episodeDetails.seasonNumber !== undefined
    ) {
      description = `New episode available for ${notification.title}! ${emoji}`

      const seasonNum = episodeDetails.seasonNumber.toString().padStart(2, '0')
      const episodeNum = episodeDetails.episodeNumber
        .toString()
        .padStart(2, '0')

      const episodeTitle = episodeDetails.title
        ? ` - "${episodeDetails.title}"`
        : ''

      fields.push({
        name: 'Episode',
        value: truncate(
          `S${seasonNum}E${episodeNum}${episodeTitle}`,
          EMBED_FIELD_MAX,
        ),
        inline: false,
      })

      if (episodeDetails.overview) {
        fields.push({
          name: 'Overview',
          value: truncate(episodeDetails.overview, EMBED_FIELD_MAX),
          inline: false,
        })
      }

      if (episodeDetails.airDateUtc) {
        fields.push({
          name: 'Air Date',
          value: new Date(episodeDetails.airDateUtc).toLocaleDateString(),
          inline: true,
        })
      }
    } else if (episodeDetails.seasonNumber !== undefined) {
      description = `New season available for ${notification.title}! ${emoji}`
      fields.push({
        name: 'Season Added',
        value: `Season ${episodeDetails.seasonNumber}`,
        inline: true,
      })
    } else {
      description = `New content available for ${notification.title}! ${emoji}`
    }
  } else {
    description = `Movie available to watch! ${emoji}`
  }

  if (notification.tmdbUrl) {
    fields.push(tmdbField(notification.tmdbUrl))
  }

  const embed: DiscordEmbed = {
    title: truncate(notification.title, EMBED_TITLE_MAX),
    description,
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

export function createMediaAddedEmbed(
  notification: MediaNotification,
  displayName: string,
): DiscordEmbed {
  const { label, emoji } = mediaTypeLabel(notification.type)

  const embed: DiscordEmbed = {
    title: truncate(notification.title, EMBED_TITLE_MAX),
    description: `${emoji} New ${label} Added`,
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

export function createMediaWebhookPayload(
  notification: MediaNotification,
  displayName: string,
): DiscordWebhookPayload {
  return {
    embeds: [createMediaAddedEmbed(notification, displayName)],
    username: 'Pulsarr',
    avatar_url:
      'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
  }
}

function deleteSyncFields(section: DeleteSyncSection): EmbedField[] {
  if (section.deleted <= 0) {
    return [
      {
        name: section.label,
        value: `No ${section.noun} deleted${section.protectedInfo}`,
        inline: false,
      },
    ]
  }

  const list = section.shown
    .map((title) => `• ${truncate(title, DELETE_SYNC_ITEM_MAX)}`)
    .join('\n')

  const fields: EmbedField[] = [
    {
      name: `${section.label} (${section.deleted} deleted${section.protectedInfo})`,
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

  const description = summary.protectedText
    ? `${summary.summaryText}\n\n${summary.protectedText}`
    : summary.summaryText

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
    description,
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
    title: truncate(displayName, EMBED_TITLE_MAX),
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

export function createSystemEmbed(
  title: string,
  fields: EmbedField[],
  safetyTriggered?: boolean,
  tmdbUrl?: string,
): DiscordEmbed {
  const embedFields = [...fields]
  if (tmdbUrl) {
    embedFields.push(tmdbField(tmdbUrl))
  }

  return {
    title: truncate(title, EMBED_TITLE_MAX),
    description: 'System notification',
    color: isSafetyNotification({ title, embedFields: fields, safetyTriggered })
      ? COLOR_RED
      : COLOR_GREEN,
    timestamp: new Date().toISOString(),
    fields: embedFields,
  }
}
