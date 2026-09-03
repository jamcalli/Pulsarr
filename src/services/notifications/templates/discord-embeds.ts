import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  DiscordEmbed,
  DiscordWebhookPayload,
  MediaNotification,
} from '@root/types/discord.types.js'

export const EMBED_COLOR = 0x48a9a6

export const COLOR_RED = 0xff0000

export const COLOR_GREEN = 0x00ff00

export function createMediaNotificationEmbed(
  notification: MediaNotification,
): DiscordEmbed {
  const emoji = notification.type === 'movie' ? '🎬' : '📺'
  let description: string
  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

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

      const episodeId = `S${seasonNum}E${episodeNum}`

      const episodeTitle = episodeDetails.title
        ? ` - ${episodeDetails.title}`
        : ''

      fields.push({
        name: 'Episode',
        value: `${episodeId}${episodeTitle}`,
        inline: false,
      })

      if (episodeDetails.overview) {
        const overview =
          episodeDetails.overview.length > 1024
            ? `${episodeDetails.overview.slice(0, 1021)}...`
            : episodeDetails.overview
        fields.push({
          name: 'Overview',
          value: overview,
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
    fields.push({
      name: 'More Info',
      value: `[View on TMDB](${notification.tmdbUrl})`,
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title:
      notification.title.length > 256
        ? `${notification.title.slice(0, 253)}...`
        : notification.title,
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
  const emoji = notification.type === 'movie' ? '🎬' : '📺'
  const mediaType =
    notification.type.charAt(0).toUpperCase() + notification.type.slice(1)

  const embed: DiscordEmbed = {
    title:
      notification.title.length > 256
        ? `${notification.title.slice(0, 253)}...`
        : notification.title,
    description: `${emoji} New ${mediaType} Added`,
    color: EMBED_COLOR,
    timestamp: new Date().toISOString(),
    footer: {
      text: `Added by ${displayName}`,
    },
    fields: [
      {
        name: 'Type',
        value: mediaType,
        inline: true,
      },
    ],
  }

  if (notification.tmdbUrl && embed.fields) {
    embed.fields.push({
      name: 'More Info',
      value: `[View on TMDB](${notification.tmdbUrl})`,
      inline: true,
    })
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

export function createDeleteSyncEmbed(
  results: DeleteSyncResult,
  dryRun: boolean,
): DiscordEmbed {
  let title: string
  let description: string
  const color = results.safetyTriggered === true ? COLOR_RED : COLOR_GREEN

  if (results.safetyTriggered) {
    title = '⚠️ Delete Sync Safety Triggered'
    description =
      results.safetyMessage ||
      'A safety check prevented the delete sync operation from running.'
  } else if (dryRun) {
    title = '🔍 Delete Sync Simulation Results'
    description = 'This was a dry run - no content was actually deleted.'
  } else {
    title = '🗑️ Delete Sync Results'
    description =
      "The following content was removed because it's no longer in any user's watchlist."
  }

  if (results.total.protected && results.total.protected > 0) {
    description += `\n\n${results.total.protected} items were preserved because they are in protected playlists.`
  }

  const fields = [
    {
      name: 'Summary',
      value: `Processed: ${results.total.processed} items\nDeleted: ${results.total.deleted} items\nSkipped: ${results.total.skipped} items${results.total.protected ? `\nProtected: ${results.total.protected} items` : ''}`,
      inline: false,
    },
  ]

  if (results.safetyTriggered && results.safetyMessage) {
    fields.push({
      name: 'Safety Reason',
      value: results.safetyMessage,
      inline: false,
    })
  }

  if (results.movies.deleted > 0) {
    const movieList = results.movies.items
      .slice(0, 10)
      .map((item) => {
        const title =
          item.title.length > 90 ? `${item.title.slice(0, 87)}...` : item.title
        return `• ${title}`
      })
      .join('\n')

    const protectedInfo =
      results.movies.protected && results.movies.protected > 0
        ? ` (${results.movies.protected} protected)`
        : ''

    fields.push({
      name: `Movies (${results.movies.deleted} deleted${protectedInfo})`,
      value: movieList || 'None',
      inline: false,
    })

    if (results.movies.items.length > 10) {
      fields.push({
        name: 'Movies (continued)',
        value: `... and ${results.movies.items.length - 10} more`,
        inline: false,
      })
    }
  } else {
    const protectedInfo =
      results.movies.protected && results.movies.protected > 0
        ? ` (${results.movies.protected} protected)`
        : ''

    fields.push({
      name: 'Movies',
      value: `No movies deleted${protectedInfo}`,
      inline: false,
    })
  }

  if (results.shows.deleted > 0) {
    const showList = results.shows.items
      .slice(0, 10)
      .map((item) => {
        const title =
          item.title.length > 90 ? `${item.title.slice(0, 87)}...` : item.title
        return `• ${title}`
      })
      .join('\n')

    const protectedInfo =
      results.shows.protected && results.shows.protected > 0
        ? ` (${results.shows.protected} protected)`
        : ''

    fields.push({
      name: `TV Shows (${results.shows.deleted} deleted${protectedInfo})`,
      value: showList || 'None',
      inline: false,
    })

    if (results.shows.items.length > 10) {
      fields.push({
        name: 'TV Shows (continued)',
        value: `... and ${results.shows.items.length - 10} more`,
        inline: false,
      })
    }
  } else {
    const protectedInfo =
      results.shows.protected && results.shows.protected > 0
        ? ` (${results.shows.protected} protected)`
        : ''

    fields.push({
      name: 'TV Shows',
      value: `No TV shows deleted${protectedInfo}`,
      inline: false,
    })
  }

  return {
    title,
    description,
    color,
    timestamp: new Date().toISOString(),
    fields,
    footer: {
      text: `Delete sync operation completed at ${new Date().toLocaleString()}`,
    },
  }
}

const DISCORD_DESCRIPTION_MAX = 4096

export function createUpdateAvailableEmbed(release: {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  releaseBody: string | null
  publishedAt: string | null
}): DiscordEmbed {
  const displayName = release.releaseName?.trim() || `v${release.latestVersion}`
  const body = release.releaseBody?.trim() ?? ''

  const versionLine = `**Current:** v${release.currentVersion}\n**Latest:** v${release.latestVersion}\n\n`
  const maxBody = DISCORD_DESCRIPTION_MAX - versionLine.length
  const truncatedBody =
    body.length > maxBody
      ? `${body.slice(0, Math.max(0, maxBody - 3))}...`
      : body

  const description = truncatedBody
    ? `${versionLine}${truncatedBody}`
    : `${versionLine}_No release notes provided._`

  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

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

  const title =
    displayName.length > 256 ? `${displayName.slice(0, 253)}...` : displayName

  return {
    title,
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
  fields: Array<{ name: string; value: string; inline?: boolean }>,
  safetyTriggered?: boolean,
  tmdbUrl?: string,
): DiscordEmbed {
  const hasSafetyField = fields.some((field) => field.name === 'Safety Reason')
  const isSafetyTriggered = title.includes('Safety Triggered')

  const embedFields = [...fields]
  if (tmdbUrl) {
    embedFields.push({
      name: 'More Info',
      value: `[View on TMDB](${tmdbUrl})`,
      inline: true,
    })
  }

  return {
    title: title.length > 256 ? `${title.slice(0, 253)}...` : title,
    description: 'System notification',
    color:
      hasSafetyField || isSafetyTriggered || safetyTriggered
        ? COLOR_RED
        : COLOR_GREEN,
    timestamp: new Date().toISOString(),
    fields: embedFields,
  }
}
