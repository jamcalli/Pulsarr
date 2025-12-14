/**
 * Discord Embed Templates
 *
 * Pure functions for building Discord embed payloads.
 * These create consistent formatting across all Discord notifications.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  DiscordEmbed,
  DiscordWebhookPayload,
  MediaNotification,
} from '@root/types/discord.types.js'

/** Default embed color - Pulsarr teal */
export const EMBED_COLOR = 0x48a9a6

/** Red color for errors/warnings */
export const COLOR_RED = 0xff0000

/** Green color for success */
export const COLOR_GREEN = 0x00ff00

/**
 * Creates a media notification embed with consistent formatting.
 * Used for both public channel posts and direct messages.
 */
export function createMediaNotificationEmbed(
  notification: MediaNotification,
): DiscordEmbed {
  const emoji = notification.type === 'movie' ? '🎬' : '📺'
  let description: string
  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

  if (notification.type === 'show' && notification.episodeDetails) {
    const { episodeDetails } = notification

    // Check if it's a single episode (has episode number) or bulk release
    if (
      episodeDetails.episodeNumber !== undefined &&
      episodeDetails.seasonNumber !== undefined
    ) {
      // Single episode release
      description = `New episode available for ${notification.title}! ${emoji}`

      // Format season and episode numbers with padding
      const seasonNum = episodeDetails.seasonNumber.toString().padStart(2, '0')
      const episodeNum = episodeDetails.episodeNumber
        .toString()
        .padStart(2, '0')

      // Create episode identifier
      const episodeId = `S${seasonNum}E${episodeNum}`

      // Add episode title if available
      const episodeTitle = episodeDetails.title
        ? ` - ${episodeDetails.title}`
        : ''

      fields.push({
        name: 'Episode',
        value: `${episodeId}${episodeTitle}`,
        inline: false,
      })

      // Add overview if available
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

      // Add air date if available
      if (episodeDetails.airDateUtc) {
        fields.push({
          name: 'Air Date',
          value: new Date(episodeDetails.airDateUtc).toLocaleDateString(),
          inline: true,
        })
      }
    } else if (episodeDetails.seasonNumber !== undefined) {
      // Bulk release
      description = `New season available for ${notification.title}! ${emoji}`
      fields.push({
        name: 'Season Added',
        value: `Season ${episodeDetails.seasonNumber}`,
        inline: true,
      })
    } else {
      // Fallback description if somehow neither condition is met
      description = `New content available for ${notification.title}! ${emoji}`
    }
  } else {
    // Movie notification - impersonal for consistency
    description = `Movie available to watch! ${emoji}`
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

/**
 * Creates a media webhook embed payload (for admin "user added X" notifications).
 */
export function createMediaWebhookPayload(
  notification: MediaNotification,
  displayName: string,
): DiscordWebhookPayload {
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

  if (notification.posterUrl) {
    embed.image = {
      url: notification.posterUrl,
    }
  }

  return {
    embeds: [embed],
    username: 'Pulsarr',
    avatar_url:
      'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
  }
}

/**
 * Creates a delete sync results embed.
 */
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

  // Add protected playlist information if there are protected items
  if (results.total.protected && results.total.protected > 0) {
    description += `\n\n${results.total.protected} items were preserved because they are in protected playlists.`
  }

  // Create fields for the embed
  const fields = [
    {
      name: 'Summary',
      value: `Processed: ${results.total.processed} items\nDeleted: ${results.total.deleted} items\nSkipped: ${results.total.skipped} items${results.total.protected ? `\nProtected: ${results.total.protected} items` : ''}`,
      inline: false,
    },
  ]

  // Add safety message field if it exists
  if (results.safetyTriggered && results.safetyMessage) {
    fields.push({
      name: 'Safety Reason',
      value: results.safetyMessage,
      inline: false,
    })
  }

  // Add movies field if any were deleted
  if (results.movies.deleted > 0) {
    const movieList = results.movies.items
      .slice(0, 10)
      .map((item) => `• ${item.title}`)
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

  // Add shows field if any were deleted
  if (results.shows.deleted > 0) {
    const showList = results.shows.items
      .slice(0, 10)
      .map((item) => `• ${item.title}`)
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

/**
 * Creates a system notification embed (for DMs).
 */
export function createSystemEmbed(
  title: string,
  fields: Array<{ name: string; value: string; inline?: boolean }>,
  safetyTriggered?: boolean,
): DiscordEmbed {
  const hasSafetyField = fields.some((field) => field.name === 'Safety Reason')
  const isSafetyTriggered = title.includes('Safety Triggered')

  return {
    title: title.length > 256 ? `${title.slice(0, 253)}...` : title,
    description: 'System notification',
    color:
      hasSafetyField || isSafetyTriggered || safetyTriggered
        ? COLOR_RED
        : COLOR_GREEN,
    timestamp: new Date().toISOString(),
    fields,
  }
}
