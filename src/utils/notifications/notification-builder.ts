import type { Config } from '@root/types/config.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type {
  MediaNotification,
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'

/**
 * Returns a deduplicated array of valid Discord user IDs from notification results, excluding virtual users and empty IDs.
 *
 * Only includes users who have opted into Discord notifications via their notify_discord preference.
 *
 * @param notifications - Array of notification results containing user objects.
 * @returns Unique, non-empty Discord user IDs, excluding users with ID -1 and those who opted out.
 */
export function extractUserDiscordIds(
  notifications: Array<{
    user: { id: number; discord_id: string | null; notify_discord?: boolean }
  }>,
): string[] {
  return Array.from(
    new Set(
      notifications
        .filter(
          (r) =>
            r.user.id !== -1 &&
            r.user.discord_id &&
            r.user.discord_id.trim() !== '' &&
            r.user.notify_discord !== false,
        )
        .map((r) => r.user.discord_id as string),
    ),
  )
}

/**
 * Determines the notification content type (movie, season, or episode) based on media metadata and release context.
 *
 * Returns an object specifying the content type and, if applicable, the season and episode numbers. Returns `null` if the media information is insufficient to determine the type.
 *
 * @param mediaInfo - Media metadata including type, GUID, title, and optional episodes.
 * @param isBulkRelease - Indicates if the release covers an entire season.
 * @returns An object with `contentType` (`'movie'`, `'season'`, or `'episode'`), and optionally `seasonNumber` and `episodeNumber`, or `null` if undeterminable.
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
 * Constructs a notification payload containing the media type, title, username, and optionally a poster URL.
 *
 * Uses the media's title if available; otherwise, falls back to the reference item's title. Includes the poster URL if present in the reference item.
 *
 * @param mediaInfo - Media metadata for the notification.
 * @param referenceItem - Watchlist item used for fallback values.
 * @param username - The user associated with the notification.
 * @returns An object with the notification details.
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
    title: mediaInfo.title ?? referenceItem.title,
    username,
    posterUrl: referenceItem.thumb || undefined,
  }
}

/**
 * Determines whether public content notifications are enabled for Discord and Apprise based on configured URLs.
 *
 * @param config - The public content notifications configuration.
 * @returns An object with boolean flags indicating if Discord and Apprise notification URLs are present.
 */
export function getPublicContentNotificationFlags(
  config: Config['publicContentNotifications'],
) {
  return {
    hasDiscordUrls: Boolean(
      config?.discordWebhookUrls?.length ||
        config?.discordWebhookUrlsMovies?.length ||
        config?.discordWebhookUrlsShows?.length,
    ),
    hasAppriseUrls: Boolean(
      config?.appriseUrls?.length ||
        config?.appriseUrlsMovies?.length ||
        config?.appriseUrlsShows?.length,
    ),
  }
}

/**
 * Generates a notification result object for public content using a virtual user ID.
 *
 * The returned object enables routing notifications to public Discord webhooks and Apprise endpoints, with Tautulli notifications disabled.
 *
 * @param notification - The media notification details to include.
 * @param hasDiscordUrls - Whether public Discord notification URLs are configured.
 * @param hasAppriseUrls - Whether public Apprise notification URLs are configured.
 * @returns A notification result object representing a public content notification.
 *
 * @remark The virtual user with ID -1 is used only at runtime for public notifications and is never persisted to the database.
 */
export function createPublicContentNotification(
  notification: MediaNotification,
  hasDiscordUrls: boolean,
  hasAppriseUrls: boolean,
): NotificationResult {
  return {
    user: {
      id: -1, // Virtual runtime ID for public content - NOT stored in database
      name: 'Public Content',
      apprise: null,
      alias: null,
      discord_id: null,
      notify_apprise: hasAppriseUrls,
      notify_discord: hasDiscordUrls,
      notify_tautulli: false,
      tautulli_notifier_id: null,
      can_sync: false,
    },
    notification,
  }
}
