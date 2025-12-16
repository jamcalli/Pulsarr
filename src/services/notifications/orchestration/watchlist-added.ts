/**
 * Watchlist Added Notification Orchestration
 *
 * Handles sending notifications when a user adds content to their watchlist.
 * This notifies admins via Discord webhook and/or Apprise about new watchlist additions.
 */

import type { Friend } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import { getUserCanSync } from '@services/plex-watchlist/users/permissions.js'
import type { FastifyBaseLogger } from 'fastify'

// ============================================================================
// Types
// ============================================================================

export interface WatchlistAddedDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
}

export interface WatchlistItemInfo {
  id?: number | string
  title: string
  type: string
  thumb?: string
}

// ============================================================================
// Main Orchestration Function
// ============================================================================

/**
 * Sends watchlist addition notifications via Discord webhook and Apprise.
 * Records the notification in the database if any notification method succeeds.
 *
 * @param deps - Service dependencies
 * @param user - User who added the item (must include userId)
 * @param item - Watchlist item details
 * @returns Promise resolving to boolean indicating if any notifications were sent
 */
export async function sendWatchlistAdded(
  deps: WatchlistAddedDeps,
  user: Friend & { userId: number },
  item: WatchlistItemInfo,
): Promise<boolean> {
  const { db, logger, discordWebhook, apprise } = deps

  // Check if user has sync enabled before sending any notifications
  const canSync = await getUserCanSync(user.userId, { db, logger })
  if (!canSync) {
    const name = user.username ?? 'Unknown User'
    logger.debug(
      { userId: user.userId },
      `Skipping notification for user ${name} (ID: ${user.userId}) - sync disabled`,
    )
    return false
  }

  const username = user.username || 'Unknown User'
  let discordSent = false
  let appriseSent = false

  // Send Discord webhook notification
  try {
    // Runtime type guard to ensure valid Discord type (case-insensitive)
    const t = typeof item.type === 'string' ? item.type.toLowerCase() : ''
    const discordType: 'movie' | 'show' =
      t === 'movie' || t === 'show' ? (t as 'movie' | 'show') : 'movie'

    discordSent = await discordWebhook.sendMediaNotification({
      username,
      title: item.title,
      type: discordType,
      posterUrl: item.thumb,
    })

    logger.debug(
      { success: discordSent },
      `Notified Discord admin endpoints that ${username} added "${item.title}"`,
    )
  } catch (error) {
    logger.error(
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

  // Send Apprise notification if enabled
  if (apprise.isEnabled()) {
    try {
      appriseSent = await apprise.sendWatchlistAdditionNotification({
        title: item.title,
        type:
          typeof item.type === 'string' ? item.type.toLowerCase() : 'unknown',
        addedBy: {
          name: username,
        },
        posterUrl: item.thumb,
      })

      logger.debug(
        { success: appriseSent },
        `Notified Apprise admin endpoints that ${username} added "${item.title}"`,
      )
    } catch (error) {
      logger.error(
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
      await db.createNotificationRecord({
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
      logger.error(
        { error, userId: user.userId, title: item.title },
        'Failed to record notification history',
      )
    }

    return true
  }

  return false
}
