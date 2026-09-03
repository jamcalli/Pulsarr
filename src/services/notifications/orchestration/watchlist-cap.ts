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

interface PendingNotification {
  timer: ReturnType<typeof setTimeout>
  deps: WatchlistCapDeps
  event: WatchlistCapEvent
}

// Keyed by userId:contentType
const pendingMap = new Map<string, PendingNotification>()

// Keyed by userId:contentType; an unchanged count suppresses the next notification
const lastNotifiedCount = new Map<string, number>()

const DEBOUNCE_MS = 60_000

function createWebhookEmbed(event: WatchlistCapEvent): DiscordEmbed {
  const contentLabel = event.contentType === 'movie' ? 'Movie' : 'Show'
  const userName = event.userName || `User ${event.userId}`

  return {
    title: 'Watchlist Cap Reached',
    description: `**${userName}** reached their ${contentLabel.toLowerCase()} cap (${event.currentCount}/${event.cap})`,
    color: 0xffbf00,
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

async function sendUserNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<void> {
  try {
    const users = await deps.db.getAllUsers()
    const user = users.find((u) => u.id === event.userId)
    if (!user) return

    if (!user.notify_discord && !user.notify_apprise) return

    const contentLabel = event.contentType === 'movie' ? 'movie' : 'show'
    const displayName = user.alias || user.name || `User ${event.userId}`

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

async function dispatchNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): Promise<void> {
  const key = `${event.userId}:${event.contentType}`
  const notifySetting = deps.config.watchlistCapNotify || 'none'

  const lastCount = lastNotifiedCount.get(key)
  if (lastCount !== undefined && event.currentCount <= lastCount) {
    deps.logger.debug(
      { userId: event.userId, contentType: event.contentType },
      'Watchlist cap notification suppressed (count unchanged since last notification)',
    )
    return
  }

  lastNotifiedCount.set(key, event.currentCount)

  const { sendWebhook, sendDM, sendApprise } =
    getApprovalNotificationChannels(notifySetting)

  if (notifySetting !== 'none') {
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

  if (deps.config.watchlistCapNotifyUser) {
    void sendUserNotification(deps, event)
  }

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

  try {
    const contentLabel = event.contentType === 'movie' ? 'Movie' : 'Show'
    const userName = event.userName || `User ${event.userId}`
    await deps.db.createNotificationRecord({
      watchlist_item_id: null,
      user_id: event.userId,
      type: 'watchlist_cap',
      title: `${contentLabel} Watchlist Cap Reached`,
      message: `${userName} reached their ${contentLabel.toLowerCase()} cap (${event.currentCount}/${event.cap})`,
      sent_to_discord: sendWebhook || sendDM,
      sent_to_apprise: sendApprise,
      sent_to_native_webhook: true,
    })
  } catch (error) {
    deps.logger.error(
      { error, userId: event.userId },
      'Failed to record watchlist cap notification',
    )
  }
}

// Trailing edge debounce: each call resets the timer so a burst fires one notification with the latest count
export function sendWatchlistCapNotification(
  deps: WatchlistCapDeps,
  event: WatchlistCapEvent,
): void {
  const key = `${event.userId}:${event.contentType}`

  const existing = pendingMap.get(key)
  if (existing) {
    clearTimeout(existing.timer)
  }

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
