import type { Config } from '@root/types/config.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'

/**
 * Utility functions to eliminate code duplication across notification services.
 */

/**
 * Parse comma-separated URLs with consistent trimming and filtering.
 */
function parseUrls(urlString: string | undefined | null): string[] {
  if (!urlString) return []
  return Array.from(
    new Set(
      urlString
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0),
    ),
  )
}

/**
 * Parse and get public content URLs with type-specific fallbacks.
 * Eliminates duplication between Discord and Apprise services.
 */
export function getPublicContentUrls(
  config: Config['publicContentNotifications'],
  notificationType: 'movie' | 'show',
  urlType: 'discord' | 'apprise',
): string[] {
  const fieldPrefix =
    urlType === 'discord' ? 'discordWebhookUrls' : 'appriseUrls'

  let urls: string[] = []

  // Try type-specific URLs first
  const typeSpecificField =
    notificationType === 'movie'
      ? `${fieldPrefix}Movies`
      : `${fieldPrefix}Shows`

  if (config?.[typeSpecificField as keyof typeof config]) {
    urls = parseUrls(config[typeSpecificField as keyof typeof config] as string)
  }

  // Fallback to general URLs if no type-specific URLs
  if (urls.length === 0 && config?.[fieldPrefix as keyof typeof config]) {
    urls = parseUrls(config[fieldPrefix as keyof typeof config] as string)
  }

  return urls
}

/**
 * Extract Discord IDs from notification results for @ mentions.
 * Consolidates the logic that was repeated 5+ times.
 */
export function extractUserDiscordIds(
  notifications: Array<{ user: { id: number; discord_id: string | null } }>,
): string[] {
  return Array.from(
    new Set(
      notifications
        .filter(
          (r) =>
            r.user.id !== -1 &&
            r.user.discord_id &&
            r.user.discord_id.trim() !== '',
        )
        .map((r) => r.user.discord_id as string),
    ),
  )
}

/**
 * Determine notification type and details from media info
 */
export function determineNotificationType(
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  isBulkRelease: boolean,
) {
  let contentType: 'movie' | 'season' | 'episode'
  let seasonNumber: number | undefined
  let episodeNumber: number | undefined

  if (mediaInfo.type === 'movie') {
    contentType = 'movie'
  } else if (mediaInfo.type === 'show' && mediaInfo.episodes?.length) {
    if (isBulkRelease) {
      contentType = 'season'
      seasonNumber = mediaInfo.episodes[0].seasonNumber
    } else {
      contentType = 'episode'
      seasonNumber = mediaInfo.episodes[0].seasonNumber
      episodeNumber = mediaInfo.episodes[0].episodeNumber
    }
  } else {
    return null
  }

  return { contentType, seasonNumber, episodeNumber }
}

/**
 * Create base notification object with common properties
 */
export function createNotificationObject(
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  referenceItem: TokenWatchlistItem,
  username: string,
) {
  return {
    type: mediaInfo.type,
    title: mediaInfo.title || referenceItem.title,
    username,
    posterUrl: referenceItem.thumb || undefined,
  }
}

/**
 * Check if public content notifications are enabled for a given type
 */
export function getPublicContentNotificationFlags(
  config: Config['publicContentNotifications'],
) {
  return {
    hasDiscordUrls: Boolean(
      config?.discordWebhookUrls ||
        config?.discordWebhookUrlsMovies ||
        config?.discordWebhookUrlsShows,
    ),
    hasAppriseUrls: Boolean(
      config?.appriseUrls ||
        config?.appriseUrlsMovies ||
        config?.appriseUrlsShows,
    ),
  }
}
