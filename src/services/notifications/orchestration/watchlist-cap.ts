/**
 * Watchlist Cap Notification Orchestration
 *
 * Handles sending notifications when a user reaches their watchlist cap.
 * Supports Discord (webhook and/or DM), Apprise, and native webhooks.
 *
 * Uses trailing-edge debounce: each new cap event resets the timer.
 * After the quiet period expires (no new events), the notification fires
 * with the latest count. This batches burst additions into a single notification.
 */

import type {
  DiscordEmbed,
  SystemNotification,
} from '@root/types/discord.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { DiscordWebhookService } from '@services/notifications/channels/discord-webhook.service.js'
import { dispatchWebhooks } from '@services/notifications/channels/native-webhook.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import type { FastifyBaseLogger } from 'fastify'
import { getApprovalNotificationChannels } from './approval.js'

// ============================================================================
// Types
// ============================================================================

export interface WatchlistCapDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  discordBot: DiscordBotService
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  config: {
    watchlistCapNotify: string
    watchlistCapNotifyUser: boolean
  }
}

export interface WatchlistCapEvent {
  userId: number
  userName: string | null
  contentType: 'movie' | 'show'
  currentCount: number
  cap: number
}

// ============================================================================
// Trailing-Edge Debounce State
// ============================================================================

interface PendingNotification {
  timer: ReturnType<typeof setTimeout>
  deps: WatchlistCapDeps
  event: WatchlistCapEvent
}

/** Pending notifications keyed by userId:contentType */
const pendingMap = new Map<string, PendingNotification>()

/** Tracks last notified count — prevents re-notification at same count after debounce */
const lastNotifiedCount = new Map<string, number>()

const DEBOUNCE_MS = 60_000 // 1 minute

// ============================================================================
// Notification Builders
// ============================================================================

function createWebhookEmbed(event: WatchlistCapEvent): DiscordEmbed {
  const contentLabel = event.contentType === 'movie' ? 'Movie' : 'Show'
  const userName = event.userName || `User ${event.userId}`

  return {
    title: 'Watchlist Cap Reached',
    description: `**${userName}** reached their ${contentLabel.toLowerCase()} cap (${event.currentCount}/${event.cap})`,
    color: 0xffbf00, // Amber
    timestamp: new Date().toISOString(),
    fields: [
      {
        name: 'User',
        value: userName,
        inline: true,
      },
      {
        name: 'Content Type',
        value: contentLabel,
        inline: true,
      },
      {
        name: 'Usage',
        value: `${event.currentCount} / ${event.cap}`,
        inline: true,
      },
    ],
    footer: {
      text: 'New items will not be processed until the cap is raised or items are removed.',
    },
  }
}

// ============================================================================
// Delivery Functions
// ============================================================================

async function sendDiscordWebhookNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<boolean> {
  try {
    const embed = createWebhookEmbed(event)
    return await deps.discordWebhook.sendNotification({
      embeds: [embed],
      username: 'Pulsarr Watchlist',
      avatar_url:
        'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
    })
  } catch (error) {
    deps.logger.error({ error }, 'Error sending watchlist cap Discord webhook')
    return false
  }
}

async function sendDiscordDMNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<boolean> {
  try {
    if (deps.discordBot.getBotStatus() !== 'running') return false

    const primaryUser = await deps.db.getPrimaryUser()
    if (!primaryUser?.discord_id) return false

    const contentLabel = event.contentType === 'movie' ? 'Movie' : 'Show'
    const userName = event.userName || `User ${event.userId}`

    const sent = await deps.discordBot.sendDirectMessage(
      primaryUser.discord_id,
      {
        type: 'system',
        username: 'Watchlist Cap',
        title: 'Watchlist Cap Reached',
        embedFields: [
          {
            name: 'User',
            value: userName,
            inline: true,
          },
          {
            name: 'Content Type',
            value: contentLabel,
            inline: true,
          },
          {
            name: 'Usage',
            value: `${event.currentCount} / ${event.cap}`,
            inline: true,
          },
          {
            name: 'Impact',
            value:
              'New items will not be processed until the cap is raised or items are removed.',
            inline: false,
          },
        ],
      },
    )
    return sent
  } catch (error) {
    deps.logger.error({ error }, 'Error sending watchlist cap Discord DM')
    return false
  }
}

async function sendAppriseNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<boolean> {
  try {
    if (!deps.apprise.isEnabled()) return false

    const userName = event.userName || `User ${event.userId}`

    return await deps.apprise.sendWatchlistCapNotification({
      userName,
      contentType: event.contentType,
      currentCount: event.currentCount,
      cap: event.cap,
    })
  } catch (error) {
    deps.logger.error(
      { error },
      'Error sending watchlist cap Apprise notification',
    )
    return false
  }
}

/**
 * Sends watchlist cap notification to the affected user via their preferred channels.
 * Respects the user's per-channel notification preferences (Discord DM, Apprise).
 */
async function sendUserNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<void> {
  try {
    const users = await deps.db.getAllUsers()
    const user = users.find((u) => u.id === event.userId)
    if (!user) return

    // Skip if user has no notification channels enabled
    if (!user.notify_discord && !user.notify_apprise) return

    const contentLabel = event.contentType === 'movie' ? 'movie' : 'show'
    const displayName = user.alias || user.name || `User ${event.userId}`

    // Discord DM — respect user.notify_discord preference
    if (user.notify_discord && user.discord_id) {
      if (deps.discordBot.getBotStatus() === 'running') {
        const notification: SystemNotification = {
          type: 'system',
          username: 'Pulsarr',
          title: 'Watchlist Cap Reached',
          embedFields: [
            {
              name: 'Notice',
              value: `${displayName}, you've reached your ${contentLabel} watchlist cap (${event.currentCount}/${event.cap}). New ${contentLabel} items won't be processed until the cap is raised or existing items are removed.`,
              inline: false,
            },
          ],
        }
        try {
          await deps.discordBot.sendDirectMessage(user.discord_id, notification)
        } catch (error) {
          deps.logger.error(
            { error, userId: user.id },
            'Error sending watchlist cap Discord DM to user',
          )
        }
      }
    }

    // Apprise — respect user.notify_apprise preference, send to user's personal URL
    if (user.notify_apprise && deps.apprise.isEnabled()) {
      try {
        await deps.apprise.sendUserWatchlistCapNotification(user, {
          userName: displayName,
          contentType: event.contentType,
          currentCount: event.currentCount,
          cap: event.cap,
        })
      } catch (error) {
        deps.logger.error(
          { error, userId: user.id },
          'Error sending watchlist cap Apprise notification to user',
        )
      }
    }
  } catch (error) {
    deps.logger.error(
      { error, userId: event.userId },
      'Error sending watchlist cap user notification',
    )
  }
}

// ============================================================================
// Core Dispatch (called when debounce timer fires)
// ============================================================================

/**
 * Dispatches the actual notifications. Called by the debounce timer.
 */
async function dispatchNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<void> {
  const key = `${event.userId}:${event.contentType}`
  const notifySetting = deps.config.watchlistCapNotify || 'none'

  // Count-change gate — skip if count hasn't changed since last sent notification
  const lastCount = lastNotifiedCount.get(key)
  if (lastCount !== undefined && event.currentCount <= lastCount) {
    deps.logger.debug(
      { userId: event.userId, contentType: event.contentType },
      'Watchlist cap notification suppressed (count unchanged since last notification)',
    )
    return
  }

  // Record the count we're notifying about
  lastNotifiedCount.set(key, event.currentCount)

  // Admin channel notifications
  if (notifySetting !== 'none') {
    const { sendWebhook, sendDM, sendApprise } =
      getApprovalNotificationChannels(notifySetting)

    const promises: Promise<boolean>[] = []

    if (sendWebhook) {
      promises.push(sendDiscordWebhookNotification(deps, event))
    }
    if (sendDM) {
      promises.push(sendDiscordDMNotification(deps, event))
    }
    if (sendApprise) {
      promises.push(sendAppriseNotification(deps, event))
    }

    if (promises.length > 0) {
      const results = await Promise.all(promises)
      const successCount = results.filter(Boolean).length
      deps.logger.info(
        {
          userId: event.userId,
          contentType: event.contentType,
          count: event.currentCount,
          cap: event.cap,
          channelsSent: successCount,
        },
        'Watchlist cap notification sent to admin channels',
      )
    }
  }

  // User notification — respects per-user channel preferences
  if (deps.config.watchlistCapNotifyUser) {
    void sendUserNotification(deps, event)
  }

  // Dispatch native webhook (fire-and-forget)
  void dispatchWebhooks(
    'quota.cap_reached',
    {
      user: {
        userId: event.userId,
        username: event.userName,
      },
      contentType: event.contentType,
      currentCount: event.currentCount,
      cap: event.cap,
    },
    { db: deps.db, log: deps.logger },
  )

  // Create DB notification record
  try {
    const contentLabel = event.contentType === 'movie' ? 'Movie' : 'Show'
    const userName = event.userName || `User ${event.userId}`
    await deps.db.createNotificationRecord({
      watchlist_item_id: null,
      user_id: event.userId,
      type: 'watchlist_cap',
      title: `${contentLabel} Watchlist Cap Reached`,
      message: `${userName} reached their ${contentLabel.toLowerCase()} cap (${event.currentCount}/${event.cap})`,
      sent_to_discord: notifySetting !== 'none',
      sent_to_apprise:
        notifySetting === 'all' || notifySetting === 'apprise-only',
      sent_to_native_webhook: true,
    })
  } catch (error) {
    deps.logger.error(
      { error, userId: event.userId },
      'Failed to record watchlist cap notification',
    )
  }
}

// ============================================================================
// Main Entry Point (trailing-edge debounce)
// ============================================================================

/**
 * Queues a watchlist cap notification with trailing-edge debounce.
 *
 * Each call resets the 1-minute timer. When the timer finally expires
 * (no new events for that userId:contentType), the notification fires
 * with the latest count. This batches burst additions into one notification.
 *
 * @param deps - Service dependencies
 * @param event - The watchlist cap event
 */
export function sendWatchlistCapNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): void {
  const notifySetting = deps.config.watchlistCapNotify || 'none'

  // Skip if notifications disabled
  if (notifySetting === 'none' && !deps.config.watchlistCapNotifyUser) {
    return
  }

  const key = `${event.userId}:${event.contentType}`

  // Clear any existing pending timer for this key
  const existing = pendingMap.get(key)
  if (existing) {
    clearTimeout(existing.timer)
  }

  // Start a new trailing-edge timer with the latest event
  const timer = setTimeout(() => {
    pendingMap.delete(key)
    void dispatchNotification(deps, event)
  }, DEBOUNCE_MS)

  pendingMap.set(key, { timer, deps, event })

  deps.logger.debug(
    {
      userId: event.userId,
      contentType: event.contentType,
      count: event.currentCount,
      cap: event.cap,
    },
    existing
      ? 'Watchlist cap notification debounce reset (new event received)'
      : 'Watchlist cap notification queued (will fire after quiet period)',
  )
}
