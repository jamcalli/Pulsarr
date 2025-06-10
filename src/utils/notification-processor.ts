import type { Config } from '@root/types/config.types.js'
import type {
  SonarrEpisodeSchema,
  NotificationResult,
  MediaNotification,
} from '@root/types/sonarr.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { FastifyInstance, FastifyBaseLogger } from 'fastify'

/**
 * Converts a comma-separated string of URLs into a deduplicated array of trimmed, non-empty URLs.
 *
 * @param urlString - Comma-separated URLs, or null/undefined.
 * @returns An array of unique, trimmed URLs. Returns an empty array if {@link urlString} is null or undefined.
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
 * Retrieves unique public content notification URLs from configuration for a given content type and notification service.
 *
 * Prefers type-specific URLs (for movies or shows) if available; otherwise, falls back to general URLs for the specified service.
 *
 * @param notificationType - The content type ('movie' or 'show') to select type-specific URLs.
 * @param urlType - The notification service ('discord' or 'apprise') for which URLs are retrieved.
 * @returns An array of unique URLs for the specified content type and service.
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
 * Extracts unique, non-empty Discord user IDs from an array of notification results.
 *
 * Filters out users with ID -1 or missing/empty Discord IDs.
 *
 * @param notifications - Notification results containing user objects.
 * @returns An array of unique Discord user IDs.
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
 * Determines whether the media content is a movie, season, or episode, and returns relevant details.
 *
 * Returns an object indicating the content type (`'movie'`, `'season'`, or `'episode'`) and, if applicable, the season and episode numbers. Returns `null` if the media information is insufficient to determine the type.
 *
 * @param mediaInfo - Media metadata including type, title, and optional episodes.
 * @param isBulkRelease - Whether the release represents an entire season.
 * @returns An object with `contentType`, and optionally `seasonNumber` and `episodeNumber`, or `null` if the type cannot be determined.
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
 * Creates a notification object with content type, title, username, and an optional poster URL.
 *
 * Uses the media title if available; otherwise, falls back to the reference item's title. Includes the poster URL if present in the reference item.
 *
 * @param mediaInfo - Media metadata for the notification.
 * @param referenceItem - Watchlist item used for fallback values.
 * @param username - The user associated with the notification.
 * @returns An object containing type, title, username, and optionally posterUrl.
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
 * Checks if public content notifications are enabled for Discord and Apprise by verifying the presence of configured URLs.
 *
 * @param config - The public content notifications configuration.
 * @returns An object with flags indicating whether Discord and Apprise notification URLs are set.
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

/**
 * Creates a notification result object for public content using a virtual user.
 *
 * The returned object uses a user ID of -1 to represent public content notifications at runtime, enabling routing to public Discord webhooks and Apprise endpoints while disabling Tautulli notifications.
 *
 * @param notification - The media notification details to include in the result.
 * @param hasDiscordUrls - Indicates if public Discord notification URLs are available.
 * @param hasAppriseUrls - Indicates if public Apprise notification URLs are available.
 * @returns A notification result object with a virtual user for public content.
 *
 * @remark The virtual user with ID -1 exists only during runtime processing and is never persisted to the database.
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

/**
 * Sends notifications for the specified media content to both individual users and public channels.
 *
 * Retrieves notification targets from the database, includes public content notifications if enabled, and dispatches notifications via supported channels (Discord, Apprise, Tautulli). Supports sequential or concurrent processing.
 *
 * @param mediaInfo - Details of the media content to notify about.
 * @param isBulkRelease - Whether the release is a bulk release (such as a full season).
 * @param options - Optional settings for logging and processing mode.
 */
export async function processContentNotifications(
  fastify: FastifyInstance,
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  isBulkRelease: boolean,
  options?: {
    logger?: FastifyBaseLogger
    sequential?: boolean // for webhook.ts which uses for...of instead of Promise.all
  },
): Promise<void> {
  // Get initial notification results
  const notificationResults = await fastify.db.processNotifications(
    mediaInfo,
    isBulkRelease,
  )

  // If public content is enabled, also get public notification data
  if (fastify.config.publicContentNotifications?.enabled) {
    const publicNotificationResults = await fastify.db.processNotifications(
      mediaInfo,
      isBulkRelease,
      true, // byGuid = true for public content
    )
    // Add public notifications to the existing user notifications
    notificationResults.push(...publicNotificationResults)
  }

  // Get matching watchlist items for Tautulli notifications
  const matchingItems = await fastify.db.getWatchlistItemsByGuid(mediaInfo.guid)

  // Process notifications either sequentially or concurrently
  if (options?.sequential) {
    for (const result of notificationResults) {
      await processIndividualNotification(
        fastify,
        result,
        notificationResults,
        matchingItems,
        mediaInfo,
        options,
      )
    }
  } else {
    // Process notifications concurrently to reduce latency
    await Promise.all(
      notificationResults.map(async (result) => {
        await processIndividualNotification(
          fastify,
          result,
          notificationResults,
          matchingItems,
          mediaInfo,
          options,
        )
      }),
    )
  }
}

/**
 * Sends notifications for a single notification result, handling both public content and individual user notifications.
 *
 * For public content (virtual user ID -1), sends notifications to global Discord webhooks and Apprise endpoints, mentioning all real user Discord IDs where applicable. For regular users, sends direct Discord messages, Apprise notifications, and Tautulli notifications if enabled.
 *
 * @param result - The notification result to process.
 * @param allNotificationResults - All notification results for the current event, used to collect user Discord IDs for public notifications.
 * @param matchingItems - Watchlist items matching the current media, used for Tautulli notifications.
 * @param mediaInfo - Information about the media being notified.
 * @param options - Optional logger for logging notification outcomes.
 */
async function processIndividualNotification(
  fastify: FastifyInstance,
  result: NotificationResult,
  allNotificationResults: NotificationResult[],
  matchingItems: TokenWatchlistItem[],
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  options?: {
    logger?: FastifyBaseLogger
  },
): Promise<void> {
  const log = options?.logger || fastify.log

  // Handle public content notifications specially
  // Note: ID -1 is a virtual runtime identifier, actual database records use user_id: null
  if (result.user.id === -1) {
    // This is public content - route to global endpoints
    if (result.user.notify_discord) {
      try {
        // Collect Discord IDs from all real users for @ mentions
        const userDiscordIds = extractUserDiscordIds(allNotificationResults)
        await fastify.discord.sendPublicNotification(
          result.notification,
          userDiscordIds,
        )
      } catch (error) {
        log.error(
          { error, userId: result.user.id },
          'Failed to send public Discord notification',
        )
      }
    }
    if (result.user.notify_apprise) {
      try {
        await fastify.apprise.sendPublicNotification(result.notification)
      } catch (error) {
        log.error(
          { error, userId: result.user.id },
          'Failed to send public Apprise notification',
        )
      }
    }
  } else {
    // Regular user notifications
    if (result.user.notify_discord && result.user.discord_id) {
      try {
        await fastify.discord.sendDirectMessage(
          result.user.discord_id,
          result.notification,
        )
      } catch (error) {
        log.error(
          {
            error,
            userId: result.user.id,
            discord_id: result.user.discord_id,
          },
          'Failed to send Discord notification',
        )
      }
    }

    if (result.user.notify_apprise) {
      try {
        await fastify.apprise.sendMediaNotification(
          result.user,
          result.notification,
        )
      } catch (error) {
        log.error(
          { error, userId: result.user.id },
          'Failed to send Apprise notification',
        )
      }
    }

    // Handle Tautulli notifications centrally to maintain DRY principles
    if (result.user.notify_tautulli && fastify.tautulli?.isEnabled()) {
      try {
        // Find the watchlist item for this user
        const userItem = matchingItems.find(
          (item) => item.user_id === result.user.id,
        )

        if (userItem) {
          const itemId =
            typeof userItem.id === 'string'
              ? Number.parseInt(userItem.id, 10)
              : userItem.id

          const sent = await fastify.tautulli.sendMediaNotification(
            result.user,
            result.notification,
            itemId,
            mediaInfo.guid,
            userItem.key,
          )

          log.info(
            {
              userId: result.user.id,
              username: result.user.name,
              success: sent,
              mediaType: mediaInfo.type,
              guid: mediaInfo.guid,
            },
            'Sent Tautulli notification',
          )
        }
      } catch (error) {
        log.error(
          { error, userId: result.user.id, guid: mediaInfo.guid },
          'Failed to send Tautulli notification',
        )
      }
    }
  }
}
