/**
 * Watchlist Added Notification Orchestration
 *
 * Handles sending notifications when a user adds content to their watchlist.
 * This notifies admins via Discord webhook, an admin DM, and/or Apprise.
 */

import { buildRoutedToItem } from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type { MediaNotification } from '@root/types/discord.types.js'
import type { Friend } from '@root/types/plex.types.js'
import type { RoutingDetails } from '@root/types/router.types.js'
import { getTmdbUrl } from '@root/utils/guid-handler.js'
import { buildPosterUrl } from '@root/utils/poster-url.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import { dispatchWebhooks } from '@services/notifications/channels/native-webhook.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import { createMediaAddedEmbed } from '@services/notifications/templates/discord-embeds.js'
import { getUserCanSync } from '@services/plex-watchlist/users/permissions.js'
import type { FastifyBaseLogger } from 'fastify'
import { getApprovalNotificationChannels } from './approval.js'

// ============================================================================
// Types
// ============================================================================

export interface WatchlistAddedDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  discordBot: DiscordBotService
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  config: {
    watchlistAddNotify: string
  }
}

export interface WatchlistItemInfo {
  id?: number | string
  title: string
  type: string
  thumb?: string
  key?: string
  guids?: string | string[]
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
 * @param routingDetails - Optional routing information from the content router
 * @returns Promise resolving to boolean indicating if any notifications were sent
 */
export async function sendWatchlistAdded(
  deps: WatchlistAddedDeps,
  user: Friend & { userId: number },
  item: WatchlistItemInfo,
  routingDetails?: RoutingDetails[],
): Promise<boolean> {
  const { db, logger, discordBot, discordWebhook, apprise, config } = deps

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

  const channels = getApprovalNotificationChannels(config.watchlistAddNotify)

  const username = user.username || 'Unknown User'
  let discordSent = false
  let dmSent = false
  let appriseSent = false

  // Resolve the adder's alias once for the channels that take it from the
  // orchestration (admin DM, Apprise). The webhook resolves its own alias.
  const addedByAlias =
    channels.sendDM || channels.sendApprise
      ? ((await db.getUser(user.userId))?.alias ?? undefined)
      : undefined

  // Generate TMDB URL from guids
  const t = typeof item.type === 'string' ? item.type.toLowerCase() : ''
  const mediaType: 'movie' | 'show' =
    t === 'movie' || t === 'show' ? (t as 'movie' | 'show') : 'movie'
  const tmdbUrl = getTmdbUrl(item.guids, mediaType)

  const notification: MediaNotification = {
    username,
    title: item.title,
    type: mediaType,
    posterUrl: buildPosterUrl(item.thumb, 'notification') ?? undefined,
    tmdbUrl,
  }

  if (channels.sendWebhook) {
    try {
      discordSent = await discordWebhook.sendMediaNotification(notification)

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
  }

  if (channels.sendDM) {
    try {
      const primaryUser = await db.getPrimaryUser()
      if (primaryUser?.discord_id) {
        dmSent = await discordBot.sendDirectMessageEmbed(
          primaryUser.discord_id,
          createMediaAddedEmbed(notification, addedByAlias ?? username),
        )
      }
    } catch (error) {
      logger.error(
        {
          error,
          username,
          title: item.title,
          userId: user.userId,
        },
        'Error sending Discord admin DM notification',
      )
    }
  }

  if (channels.sendApprise && apprise.isEnabled()) {
    try {
      appriseSent = await apprise.sendWatchlistAdditionNotification({
        title: item.title,
        type: mediaType,
        addedBy: {
          name: username,
          alias: addedByAlias,
        },
        posterUrl: buildPosterUrl(item.thumb, 'notification') ?? undefined,
        tmdbUrl,
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

  // Normalize guids to array format
  const guidsArray = Array.isArray(item.guids)
    ? item.guids
    : item.guids
      ? [item.guids]
      : []

  // Build routedTo array from routing details using helper for discriminated union
  const routedTo =
    routingDetails?.map((detail) => buildRoutedToItem(detail)) ?? []

  // Determine content type with proper literal type
  const contentType =
    item.type?.toLowerCase() === 'show' ? ('show' as const) : ('movie' as const)

  // Dispatch native webhooks
  let webhookSent = false
  try {
    const webhookResult = await dispatchWebhooks(
      'watchlist.added',
      {
        addedBy: {
          userId: user.userId,
          username,
        },
        content: {
          title: item.title,
          type: contentType,
          thumb: buildPosterUrl(item.thumb, 'notification') ?? undefined,
          key: item.key ?? '',
          guids: guidsArray,
        },
        routedTo,
      },
      { db, log: logger },
    )
    webhookSent = webhookResult.succeeded > 0
  } catch (error) {
    logger.error(
      {
        error,
        username,
        title: item.title,
        userId: user.userId,
      },
      'Error dispatching native webhooks',
    )
  }

  // Record notification if any method succeeded
  if (discordSent || dmSent || appriseSent || webhookSent) {
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
        sent_to_discord: discordSent || dmSent,
        sent_to_apprise: appriseSent,
        sent_to_native_webhook: webhookSent,
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
