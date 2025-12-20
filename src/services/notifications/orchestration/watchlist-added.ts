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
import { dispatchWebhooks } from '@services/notifications/channels/native-webhook.js'
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
  key?: string
  guids?: string | string[]
}

export interface RoutingDetails {
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  qualityProfile?: number | string | null
  rootFolder?: string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  minimumAvailability?: string | null
  seasonMonitoring?: string | null
  seriesType?: string | null
  ruleId?: number
  ruleName?: string
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
        type: typeof item.type === 'string' ? item.type.toLowerCase() : 'movie',
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

  // Normalize guids to array format
  const guidsArray = Array.isArray(item.guids)
    ? item.guids
    : item.guids
      ? [item.guids]
      : []

  // Build routedTo array from routing details
  const routedTo =
    routingDetails?.map((detail) => ({
      instanceId: detail.instanceId,
      instanceType: detail.instanceType,
      qualityProfile: detail.qualityProfile ?? undefined,
      rootFolder: detail.rootFolder ?? undefined,
      tags: detail.tags ?? [],
      searchOnAdd: detail.searchOnAdd ?? undefined,
      ruleId: detail.ruleId,
      ruleName: detail.ruleName,
      ...(detail.instanceType === 'radarr' && {
        minimumAvailability: detail.minimumAvailability ?? undefined,
      }),
      ...(detail.instanceType === 'sonarr' && {
        seasonMonitoring: detail.seasonMonitoring ?? undefined,
        seriesType: detail.seriesType ?? undefined,
      }),
    })) ?? []

  // Dispatch native webhooks
  const webhookResult = await dispatchWebhooks(
    'watchlist.added',
    {
      addedBy: {
        userId: user.userId,
        username,
      },
      content: {
        title: item.title,
        type: (item.type?.toLowerCase() === 'show' ? 'show' : 'movie') as
          | 'movie'
          | 'show',
        thumb: item.thumb,
        key: item.key,
        guids: guidsArray,
      },
      routedTo,
    },
    { db, log: logger },
  )
  const webhookSent = webhookResult.succeeded > 0

  // Record notification if any method succeeded
  if (discordSent || appriseSent || webhookSent) {
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
