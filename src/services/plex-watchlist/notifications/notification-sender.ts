/**
 * Notification Sender Module
 *
 * Handles sending watchlist notifications via Discord and Apprise,
 * and recording notification history in the database.
 */

import type { Friend } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { getUserCanSync } from '../users/permissions.js'

export interface NotificationDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  fastify: FastifyInstance
}

export interface WatchlistItemNotification {
  id?: number | string
  title: string
  type: string
  thumb?: string
}

/**
 * Sends watchlist notifications to a user via Discord and Apprise.
 * Records the notification in the database if any notification method succeeds.
 *
 * @param user - User to notify (must include userId)
 * @param item - Watchlist item details
 * @param deps - Service dependencies
 * @returns Promise resolving to boolean indicating if any notifications were sent
 */
export async function sendWatchlistNotifications(
  user: Friend & { userId: number },
  item: WatchlistItemNotification,
  deps: NotificationDeps,
): Promise<boolean> {
  // Check if user has sync enabled before sending any notifications
  const canSync = await getUserCanSync(user.userId, {
    db: deps.db,
    logger: deps.logger,
  })
  if (!canSync) {
    const name = user.username ?? 'Unknown User'
    deps.logger.debug(
      { userId: user.userId },
      `Skipping notification for user ${name} (ID: ${user.userId}) - sync disabled`,
    )
    return false
  }

  const username = user.username || 'Unknown User'
  let discordSent = false
  let appriseSent = false

  // Send Discord notification
  try {
    // Runtime type guard to ensure valid Discord type (case-insensitive)
    const t = typeof item.type === 'string' ? item.type.toLowerCase() : ''
    const discordType: 'movie' | 'show' =
      t === 'movie' || t === 'show' ? (t as 'movie' | 'show') : 'movie'

    discordSent =
      await deps.fastify.notifications.discordWebhook.sendMediaNotification({
        username,
        title: item.title,
        type: discordType,
        posterUrl: item.thumb,
      })

    deps.logger.debug(
      { success: discordSent },
      `Notified Discord admin endpoints that ${username} added "${item.title}"`,
    )
  } catch (error) {
    deps.logger.error(
      {
        error,
        username,
        title: item.title,
        type: item.type,
        userId: user.userId,
      },
      'Error sending Discord webhook notification',
    )
  }

  // Send Apprise notification
  if (deps.fastify.notifications?.apprise?.isEnabled()) {
    try {
      appriseSent =
        await deps.fastify.notifications.apprise.sendWatchlistAdditionNotification(
          {
            title: item.title,
            type:
              typeof item.type === 'string'
                ? item.type.toLowerCase()
                : 'unknown',
            addedBy: {
              name: username,
            },
            posterUrl: item.thumb,
          },
        )

      deps.logger.debug(
        { success: appriseSent },
        `Notified Apprise admin endpoints that ${username} added "${item.title}"`,
      )
    } catch (error) {
      deps.logger.error(
        {
          error,
          username,
          title: item.title,
          type: item.type,
          userId: user.userId,
        },
        'Error sending Apprise notification',
      )
    }
  }

  // Record notification if either method succeeded
  if (discordSent || appriseSent) {
    const itemId =
      typeof item.id === 'string' ? Number.parseInt(item.id, 10) : item.id

    try {
      await deps.db.createNotificationRecord({
        watchlist_item_id:
          itemId !== undefined && !Number.isNaN(itemId) ? itemId : null,
        user_id: user.userId,
        type: 'watchlist_add',
        title: item.title,
        message: `New ${item.type} added to watchlist`,
        sent_to_discord: discordSent,
        sent_to_apprise: appriseSent,
        sent_to_webhook: true,
      })
    } catch (error) {
      deps.logger.error(
        { error, userId: user.userId, title: item.title },
        'Failed to record notification history',
      )
    }

    return true
  }

  return false
}
