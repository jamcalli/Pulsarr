import type { TokenWatchlistItem } from '@root/types/plex.types.js'
import type {
  MediaNotification,
  NotificationResult,
  SonarrEpisodeSchema,
} from '@root/types/sonarr.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { extractUserDiscordIds } from './notification-builder.js'

/**
 * Sends public Discord and Apprise notifications for content.
 *
 * @param fastify - Fastify instance with notification services
 * @param result - Notification result for public content
 * @param allNotificationResults - All notification results (to extract Discord user IDs)
 * @param log - Logger instance
 */
async function sendPublicNotifications(
  fastify: FastifyInstance,
  result: NotificationResult,
  allNotificationResults: NotificationResult[],
  log: FastifyBaseLogger,
): Promise<void> {
  if (result.user.notify_discord && fastify.notifications?.discordWebhook) {
    try {
      // Collect Discord IDs from all real users for @ mentions
      const userDiscordIds = extractUserDiscordIds(allNotificationResults)
      await fastify.notifications.discordWebhook.sendPublicNotification(
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

  if (result.user.notify_apprise && fastify.apprise?.isEnabled()) {
    try {
      await fastify.apprise.sendPublicNotification(result.notification)
    } catch (error) {
      log.error(
        { error, userId: result.user.id },
        'Failed to send public Apprise notification',
      )
    }
  }
}

/**
 * Sends Discord direct message notification to a user.
 *
 * @param fastify - Fastify instance with Discord service
 * @param discordId - Discord user ID
 * @param notification - Notification payload
 * @param userId - User ID for logging
 * @param log - Logger instance
 */
async function sendDiscordNotification(
  fastify: FastifyInstance,
  discordId: string,
  notification: MediaNotification,
  userId: number,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await fastify.notifications.discordBot.sendDirectMessage(
      discordId,
      notification,
    )
  } catch (error) {
    log.error(
      {
        error,
        userId,
        discord_id: discordId,
      },
      'Failed to send Discord notification',
    )
  }
}

/**
 * Sends Apprise notification to a user.
 *
 * @param fastify - Fastify instance with Apprise service
 * @param user - User object with notification settings
 * @param notification - Notification payload
 * @param log - Logger instance
 */
async function sendAppriseNotification(
  fastify: FastifyInstance,
  user: NotificationResult['user'],
  notification: MediaNotification,
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    await fastify.apprise.sendMediaNotification(user, notification)
  } catch (error) {
    log.error({ error, userId: user.id }, 'Failed to send Apprise notification')
  }
}

/**
 * Sends Tautulli notification to a user.
 *
 * @param fastify - Fastify instance with Tautulli service
 * @param user - User object with notification settings
 * @param notification - Notification payload
 * @param itemByUserId - Map of user IDs to watchlist items
 * @param mediaInfo - Media information
 * @param log - Logger instance
 */
async function sendTautulliNotification(
  fastify: FastifyInstance,
  user: NotificationResult['user'],
  notification: MediaNotification,
  itemByUserId: Map<number, TokenWatchlistItem>,
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  log: FastifyBaseLogger,
): Promise<void> {
  try {
    // Find the watchlist item for this user
    const userItem = itemByUserId.get(user.id)

    if (userItem) {
      const rawId =
        typeof userItem.id === 'string'
          ? Number.parseInt(userItem.id, 10)
          : userItem.id
      if (Number.isNaN(rawId)) {
        log.warn(
          { rawId, userId: user.id },
          'Skipping Tautulli – invalid item id',
        )
        return
      }
      const itemId = rawId

      const sent = await fastify.tautulli.sendMediaNotification(
        user,
        notification,
        itemId,
        mediaInfo.guid,
        userItem.key,
      )

      log.debug(
        {
          userId: user.id,
          username: user.name,
          success: sent,
          mediaType: mediaInfo.type,
          guid: mediaInfo.guid,
        },
        'Sent Tautulli notification',
      )
    }
  } catch (error) {
    log.error(
      { error, userId: user.id, guid: mediaInfo.guid },
      'Failed to send Tautulli notification',
    )
  }
}

/**
 * Sends user-specific notifications (Discord DM, Apprise, Tautulli).
 *
 * @param fastify - Fastify instance with notification services
 * @param result - Notification result for the user
 * @param itemByUserId - Map of user IDs to watchlist items
 * @param mediaInfo - Media information
 * @param log - Logger instance
 */
async function sendUserNotifications(
  fastify: FastifyInstance,
  result: NotificationResult,
  itemByUserId: Map<number, TokenWatchlistItem>,
  mediaInfo: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: SonarrEpisodeSchema[]
  },
  log: FastifyBaseLogger,
): Promise<void> {
  // Send Discord DM
  if (
    result.user.notify_discord &&
    result.user.discord_id &&
    fastify.notifications?.discordBot
  ) {
    await sendDiscordNotification(
      fastify,
      result.user.discord_id,
      result.notification,
      result.user.id,
      log,
    )
  }

  // Send Apprise notification
  if (result.user.notify_apprise && fastify.apprise?.isEnabled()) {
    await sendAppriseNotification(
      fastify,
      result.user,
      result.notification,
      log,
    )
  }

  // Send Tautulli notification
  if (result.user.notify_tautulli && fastify.tautulli?.isEnabled()) {
    await sendTautulliNotification(
      fastify,
      result.user,
      result.notification,
      itemByUserId,
      mediaInfo,
      log,
    )
  }
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
export async function processIndividualNotification(
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
    await sendPublicNotifications(fastify, result, allNotificationResults, log)
  } else {
    await sendUserNotifications(fastify, result, itemByUserId, mediaInfo, log)
  }
}
