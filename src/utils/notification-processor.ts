import type { Config } from '@root/types/config.types.js'
import type {
  SonarrEpisodeSchema,
  NotificationResult,
  MediaNotification,
} from '@root/types/sonarr.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type { FastifyInstance, FastifyBaseLogger } from 'fastify'

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

/**
 * Creates a public content notification object with consistent user structure.
 * Eliminates duplication between byGuid mode and regular mode in database service.
 *
 * IMPORTANT: The user ID -1 here is ONLY used as a runtime identifier for notification
 * processing logic to distinguish public content notifications from regular user notifications.
 * This virtual user object is NEVER inserted into the database.
 *
 * Database records for public content notifications correctly use user_id: null
 * (see database.service.ts createNotificationRecord calls), which complies with the
 * foreign key constraint that allows nullable user_id values.
 *
 * The -1 ID is used in the notification processing pipeline to:
 * 1. Route notifications to public Discord webhooks vs user DMs
 * 2. Route notifications to public Apprise endpoints vs user-specific endpoints
 * 3. Skip Tautulli notifications (not applicable for public content)
 * 4. Extract real user Discord IDs for @ mentions in public notifications
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
 * Centralized notification processing function that handles both public and user notifications.
 * This eliminates the duplication across webhook.ts, pending-webhooks.service.ts, and webhookQueue.ts.
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
    onUserNotification?: (result: NotificationResult) => Promise<void>
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

  // Process notifications either sequentially or concurrently
  if (options?.sequential) {
    for (const result of notificationResults) {
      await processIndividualNotification(
        fastify,
        result,
        notificationResults,
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
          options,
        )
      }),
    )
  }
}

/**
 * Process an individual notification result, handling both global admin and regular users.
 */
async function processIndividualNotification(
  fastify: FastifyInstance,
  result: NotificationResult,
  allNotificationResults: NotificationResult[],
  options?: {
    logger?: FastifyBaseLogger
    onUserNotification?: (result: NotificationResult) => Promise<void>
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

    // Call optional callback for additional user notifications (e.g., Tautulli)
    if (options?.onUserNotification) {
      await options.onUserNotification(result)
    }
  }
}
