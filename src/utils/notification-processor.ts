import type { Config } from '@root/types/config.types.js'
import type {
  SonarrEpisodeSchema,
  NotificationResult,
  MediaNotification,
} from '@root/types/sonarr.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { FastifyInstance, FastifyBaseLogger } from 'fastify'

/**
 * Parses a comma-separated string of URLs into a unique array of trimmed URLs.
 *
 * @param urlString - A string containing URLs separated by commas, or null/undefined.
 * @returns An array of unique, non-empty, trimmed URLs.
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
 * Retrieves public content notification URLs from configuration, using type-specific fields if available and falling back to general URLs.
 *
 * @param notificationType - The type of content ('movie' or 'show') to determine which URLs to retrieve.
 * @param urlType - The notification service ('discord' or 'apprise') for which URLs are needed.
 * @returns An array of unique URLs for the specified notification type and service.
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
 * Returns a unique array of valid Discord user IDs extracted from notification results.
 *
 * Filters out entries with user ID -1, missing, or empty Discord IDs.
 *
 * @param notifications - Array of notification results containing user objects.
 * @returns An array of unique, non-empty Discord user IDs.
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
 * Determines the notification content type and relevant details based on media information and release mode.
 *
 * Returns an object specifying whether the content is a movie, season, or episode, along with season and episode numbers if applicable. Returns `null` if the media information is insufficient to determine the type.
 *
 * @param mediaInfo - Media metadata including type, title, and optional episodes.
 * @param isBulkRelease - Indicates if the release is a bulk (season) release.
 * @returns An object with `contentType`, and optionally `seasonNumber` and `episodeNumber`, or `null` if undeterminable.
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
 * Constructs a notification object containing the content type, title, username, and optional poster URL.
 *
 * If the media info does not provide a title, the title from the reference item is used. The poster URL is included if available in the reference item.
 *
 * @param mediaInfo - Information about the media content.
 * @param referenceItem - Reference watchlist item for fallback title and poster URL.
 * @param username - Name of the user associated with the notification.
 * @returns An object with type, title, username, and optional posterUrl.
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
 * Determines whether public content notifications are enabled for Discord and Apprise based on the presence of relevant URLs in the configuration.
 *
 * @param config - The public content notifications configuration object.
 * @returns An object indicating if Discord and Apprise notification URLs are configured.
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
 * Creates a notification result object for public content with a virtual user.
 *
 * The returned object uses a user ID of -1 to represent public content notifications during runtime processing. This virtual user enables routing to public Discord webhooks and Apprise endpoints, and disables Tautulli notifications. The virtual user is never persisted to the database.
 *
 * @param notification - The media notification details to include.
 * @param hasDiscordUrls - Whether public Discord notification URLs are available.
 * @param hasAppriseUrls - Whether public Apprise notification URLs are available.
 * @returns A notification result object with a virtual user for public content.
 *
 * @remark The virtual user ID -1 is used only for runtime logic and is not stored in the database.
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
 * Processes notifications for the specified media content, handling both public and individual user notifications.
 *
 * Retrieves notification targets from the database, adds public content notifications if enabled, and sends notifications via supported channels. Supports sequential or concurrent processing and optional callbacks for user notifications.
 *
 * @param mediaInfo - Information about the media content to notify about.
 * @param isBulkRelease - Indicates if the release is a bulk release (e.g., full season).
 * @param options - Optional settings for logging, notification callbacks, and processing mode.
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
 * For public content (virtual user ID -1), sends notifications to global Discord webhooks and Apprise endpoints, mentioning all real user Discord IDs where applicable. For regular users, sends direct Discord messages and Apprise notifications if enabled. Optionally invokes a callback for additional user-specific notifications.
 *
 * @param result - The notification result to process.
 * @param allNotificationResults - All notification results for the current event, used to collect user Discord IDs for public notifications.
 * @param options - Optional logger and callback for additional user notifications.
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
