import crypto from 'node:crypto'
import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'
import type { Config, PublicContentKeyMap } from '@root/types/config.types.js'
import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type {
  MediaNotification,
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

// Webhook deduplication cache
const webhookCache = new Map<
  string,
  { timestamp: number; contentInfo: string }
>()
const WEBHOOK_CACHE_TTL_MS = 10000 // 10 seconds

/**
 * Generates a stable 32-character SHA-256 hash to uniquely identify a webhook payload for deduplication.
 *
 * The hash is computed from key identifying fields: for movies, it includes the TMDB ID and title; for TV shows, it includes the TVDB ID, title, and the first episode's season and episode numbers. Event type and upgrade status are intentionally excluded to group related events.
 *
 * @returns A 32-character hexadecimal hash string representing the webhook's unique identity.
 */
function createWebhookHash(payload: WebhookPayload): string {
  const hashData: Record<string, string | number> = {
    instanceName: payload.instanceName,
  }

  if ('movie' in payload) {
    hashData.contentType = 'movie'
    hashData.contentId = payload.movie.tmdbId
    hashData.title = payload.movie.title
  } else if ('series' in payload && 'episodes' in payload) {
    hashData.contentType = 'show'
    hashData.contentId = payload.series.tvdbId
    hashData.title = payload.series.title

    // Include episode details for TV shows
    if (payload.episodes && payload.episodes.length > 0) {
      const episode = payload.episodes[0]
      hashData.seasonNumber = episode.seasonNumber
      hashData.episodeNumber = episode.episodeNumber
    }
  }

  const hashString = JSON.stringify(hashData, Object.keys(hashData).sort())
  return crypto
    .createHash('sha256')
    .update(hashString)
    .digest('hex')
    .substring(0, 32)
}

/**
 * Determines whether a webhook payload is valid and not a recent duplicate, making it eligible for processing.
 *
 * Validates Sonarr and Radarr webhook payloads by checking for required fields, event types, and file information. Skips test events, upgrade events, incomplete payloads, and duplicates received within a short deduplication window.
 *
 * @returns `true` if the webhook is valid and not a duplicate; otherwise, `false`.
 */
export function isWebhookProcessable(
  payload: WebhookPayload,
  logger?: FastifyBaseLogger,
): boolean {
  // Skip test webhooks
  if ('eventType' in payload && payload.eventType === 'Test') {
    return false
  }

  // Handle Sonarr webhooks
  if ('series' in payload || 'episodes' in payload) {
    // Sonarr webhooks must have series, episodes, and eventType
    if (
      !('series' in payload) ||
      !('episodes' in payload) ||
      !('eventType' in payload)
    ) {
      logger?.debug('Skipping invalid Sonarr webhook - missing required fields')
      return false
    }

    // Only process Download events
    const sonarrPayload = payload as { eventType: string }
    if (sonarrPayload.eventType !== 'Download') {
      logger?.debug(
        { eventType: sonarrPayload.eventType },
        'Skipping webhook - not a Download event',
      )
      return false
    }

    // Skip upgrade events
    if ('isUpgrade' in payload && payload.isUpgrade === true) {
      logger?.debug('Skipping webhook - is an upgrade event')
      return false
    }

    // Check for file information
    const hasFileInfo =
      ('episodeFile' in payload && payload.episodeFile) ||
      ('episodeFiles' in payload && payload.episodeFiles)

    if (!hasFileInfo) {
      logger?.debug('Skipping webhook - no file information')
      return false
    }
  }

  // Handle Radarr webhooks
  if ('movie' in payload) {
    // Radarr webhooks already have movie info, no additional check needed
  }

  // Check for duplicates
  const hash = createWebhookHash(payload)
  const now = Date.now()
  const existing = webhookCache.get(hash)

  if (existing && now - existing.timestamp < WEBHOOK_CACHE_TTL_MS) {
    logger?.info(
      {
        hash,
        ageMs: now - existing.timestamp,
        contentInfo: existing.contentInfo,
      },
      'Duplicate webhook detected within deduplication window',
    )
    return false
  }

  // Create content info for logging
  let contentInfo: string = payload.instanceName
  if ('movie' in payload) {
    contentInfo = `${payload.movie.title} (${payload.movie.tmdbId})`
  } else if (
    'series' in payload &&
    'episodes' in payload &&
    payload.episodes.length > 0
  ) {
    const episode = payload.episodes[0]
    contentInfo = `${payload.series.title} S${episode.seasonNumber}E${episode.episodeNumber} (${payload.series.tvdbId})`
  }

  // Store in cache
  webhookCache.set(hash, {
    timestamp: now,
    contentInfo,
  })

  // Clean up expired entries (simple time-based expiry)
  const expiredKeys: string[] = []
  for (const [key, entry] of webhookCache.entries()) {
    if (now - entry.timestamp > WEBHOOK_CACHE_TTL_MS) {
      expiredKeys.push(key)
    }
  }
  for (const key of expiredKeys) {
    webhookCache.delete(key)
  }

  logger?.debug(
    { hash, contentInfo, cacheSize: webhookCache.size },
    'Webhook marked as processable and cached',
  )

  return true
}

/**
 * Parses a comma-separated string into a deduplicated array of valid, trimmed URLs.
 *
 * @param urlString - A comma-separated list of URLs, or null/undefined.
 * @returns An array of unique, valid URLs. Returns an empty array if {@link urlString} is null, undefined, or contains no valid URLs.
 */
function parseUrls(urlString: string | undefined | null): string[] {
  if (!urlString) return []
  return Array.from(
    new Set(
      urlString
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => {
          if (url.length === 0) return false
          // Basic URL validation to catch obviously invalid strings
          try {
            new URL(url)
            return true
          } catch {
            return false
          }
        }),
    ),
  )
}

// Type-safe lookup table for config keys
const keyMap: PublicContentKeyMap = {
  discord: {
    generic: 'discordWebhookUrls',
    movies: 'discordWebhookUrlsMovies',
    shows: 'discordWebhookUrlsShows',
  },
  apprise: {
    generic: 'appriseUrls',
    movies: 'appriseUrlsMovies',
    shows: 'appriseUrlsShows',
  },
}

/**
 * Retrieves unique notification URLs for public content from configuration, prioritizing type-specific URLs for movies or shows and falling back to generic URLs for the specified service.
 *
 * @param notificationType - The content type ('movie' or 'show') used to select type-specific URLs.
 * @param urlType - The notification service ('discord' or 'apprise') for which URLs are retrieved.
 * @returns An array of unique, validated URLs for the specified content type and service.
 */
export function getPublicContentUrls(
  config: Config['publicContentNotifications'],
  notificationType: 'movie' | 'show',
  urlType: 'discord' | 'apprise',
): string[] {
  const keys = keyMap[urlType]

  // Try type-specific URLs first
  const typeSpecificKey =
    notificationType === 'movie' ? keys.movies : keys.shows
  const typeSpecificUrls = parseUrls(config?.[typeSpecificKey])

  if (typeSpecificUrls.length > 0) {
    return typeSpecificUrls
  }

  // Fallback to general URLs if no type-specific URLs
  return parseUrls(config?.[keys.generic])
}

/**
 * Returns a deduplicated array of valid Discord user IDs from notification results, excluding virtual users and empty IDs.
 *
 * @param notifications - Array of notification results containing user objects.
 * @returns Unique, non-empty Discord user IDs, excluding users with ID -1.
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
    title: mediaInfo.title || referenceItem.title,
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

/**
 * Dispatches notifications for media content updates to users and public channels.
 *
 * Retrieves notification targets from the database, determines matching watchlist items, and sends notifications via configured services (Discord, Apprise, Tautulli). Supports both sequential and concurrent processing with a concurrency limit.
 *
 * @param mediaInfo - Information about the media content being updated.
 * @param isBulkRelease - Whether the update is a bulk release (such as a full season).
 * @param options - Optional settings for logging and sequential processing.
 * @returns An object with the count of matched watchlist items.
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
    instanceId?: number // Pass through instance ID from webhook
    instanceType?: 'sonarr' | 'radarr' // Pass through instance type
  },
): Promise<{ matchedCount: number }> {
  // Get notification results (includes both individual user notifications and public notifications)
  const notificationResults = await fastify.db.processNotifications(
    mediaInfo,
    isBulkRelease,
    options?.instanceId,
    options?.instanceType,
  )

  // Early exit if there are no notifications to process
  if (notificationResults.length === 0) {
    return { matchedCount: 0 }
  }

  // Get matching watchlist items for Tautulli notifications
  const matchingItems = await fastify.db.getWatchlistItemsByGuid(mediaInfo.guid)

  // Create an index for O(1) user lookups instead of O(n) find operations
  const itemByUserId = new Map<number, TokenWatchlistItem>()
  for (const item of matchingItems) {
    itemByUserId.set(item.user_id, item)
  }

  // Process notifications either sequentially or concurrently
  if (options?.sequential) {
    for (const result of notificationResults) {
      await processIndividualNotification(
        fastify,
        result,
        notificationResults,
        itemByUserId,
        mediaInfo,
        options,
      )
    }
  } else {
    // Process notifications concurrently with rate limiting to prevent API throttling
    const limit = pLimit(10) // Limit to 10 concurrent notifications
    await Promise.all(
      notificationResults.map((result) =>
        limit(() =>
          processIndividualNotification(
            fastify,
            result,
            notificationResults,
            itemByUserId,
            mediaInfo,
            options,
          ),
        ),
      ),
    )
  }

  // Return summary with match count to avoid duplicate DB queries
  return { matchedCount: matchingItems.length }
}

/**
 * Process and dispatch a single notification result (public or per-user).
 *
 * For a public notification (virtual user id === -1) routes to global endpoints:
 * - Sends public Discord notifications via configured webhooks and includes real user Discord IDs for mentions.
 * - Sends public Apprise notifications to configured endpoints.
 *
 * For a regular user, sends:
 * - Direct Discord DM when `notify_discord` and `discord_id` are present.
 * - Per-user Apprise notifications when `notify_apprise` is set.
 * - Tautulli notifications when `notify_tautulli` is set and Tautulli is enabled; looks up the user's watchlist item via `itemByUserId` and skips Tautulli if the item id is not a valid number.
 *
 * All external delivery failures are caught and logged; the function does not throw for delivery errors.
 *
 * @param result - The NotificationResult to process (includes `user` flags and `notification` payload).
 * @param allNotificationResults - All notification results for the current event; used to collect real user Discord IDs for public notifications.
 * @param itemByUserId - Map from user ID to the user's watchlist item, used to resolve item IDs for Tautulli notifications.
 * @param mediaInfo - Minimal media metadata (type, guid, title, and optional episodes) for contextual notifications.
 * @param options.logger - Optional logger to use instead of the Fastify instance logger.
 */
async function processIndividualNotification(
  fastify: FastifyInstance,
  result: NotificationResult,
  allNotificationResults: NotificationResult[],
  itemByUserId: Map<number, TokenWatchlistItem>,
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
        const userItem = itemByUserId.get(result.user.id)

        if (userItem) {
          const rawId =
            typeof userItem.id === 'string'
              ? Number.parseInt(userItem.id, 10)
              : userItem.id
          if (Number.isNaN(rawId)) {
            log.warn(
              { rawId, userId: result.user.id },
              'Skipping Tautulli – invalid item id',
            )
            return
          }
          const itemId = rawId

          const sent = await fastify.tautulli.sendMediaNotification(
            result.user,
            result.notification,
            itemId,
            mediaInfo.guid,
            userItem.key,
          )

          log.debug(
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
