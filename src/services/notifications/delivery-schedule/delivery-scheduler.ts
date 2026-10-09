/**
 * Notification Delivery Scheduler
 *
 * Holds media-available user notifications during a user's quiet hours or
 * digest window, persists them in `held_notifications`, and delivers each
 * user's held notifications as one digest once they fall due.
 *
 * Dedupe and delivery guarantees:
 * - The notification record (the dedupe key) is written by the orchestrator
 *   before it reaches the hold decision, exactly as for immediate delivery,
 *   so a repeat webhook for a held episode is still recognised as a duplicate
 *   and never queued twice.
 * - Delivery claims a user's rows, sends, then deletes them. A crash after
 *   the claim leaves claimed rows behind; on the next start they are dropped
 *   with a warning rather than resent, so a send that went out just before
 *   the crash is never duplicated (at-most-once, the same guarantee immediate
 *   delivery has). Unclaimed rows always survive a restart and are delivered.
 */

import type {
  Config,
  NotificationUser,
  User,
} from '@root/types/config.types.js'
import type { MediaNotification } from '@root/types/discord.types.js'
import type {
  HeldEpisode,
  HeldNotification,
} from '@root/types/notification-delivery.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { AppriseService } from '@services/notifications/channels/apprise.service.js'
import type { PlexMobileService } from '@services/notifications/channels/plex-mobile.service.js'
import type { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import { createMediaDigestEmbed } from '@services/notifications/templates/discord-embeds.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  buildDigest,
  type DigestTitle,
  toDigestEntries,
  toPlexMobileNotification,
} from './digest.js'
import { computeDeliveryDecision, resolveDeliverySchedule } from './schedule.js'

/** How often due held notifications are checked for. */
export const FLUSH_INTERVAL_MS = 30_000

export interface DeliverySchedulerDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  getConfig: () => Pick<Config, 'notificationDelivery'>
  discordBot: Pick<
    DiscordBotService,
    'sendDirectMessage' | 'sendDirectMessageEmbed'
  >
  apprise: Pick<
    AppriseService,
    'isEnabled' | 'sendMediaNotification' | 'sendMediaDigestNotification'
  >
  plexMobile: Pick<PlexMobileService, 'isEnabled' | 'sendMediaNotification'>
  now?: () => number
}

/** A user notification about to be delivered, as built by the orchestrator. */
export interface HoldRequest {
  user: Pick<NotificationUser, 'id' | 'name'>
  notification: MediaNotification
  media: {
    type: 'movie' | 'show'
    guid: string
    title: string
    episodes?: Array<{ seasonNumber: number; episodeNumber: number }>
  }
  isBulkRelease: boolean
  watchlistItemKey?: string
}

export class NotificationDeliveryScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<number> | null = null
  private stopped = false

  constructor(private readonly deps: DeliverySchedulerDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now()
  }

  /**
   * Holds the notification for later delivery when the user's schedule says
   * so. Returns false (deliver now) when nothing applies or anything fails,
   * so a scheduling problem never swallows a notification.
   */
  async holdIfScheduled(request: HoldRequest): Promise<boolean> {
    const { db, logger } = this.deps
    try {
      const user = await db.getUser(request.user.id)
      if (!user) return false

      const schedule = resolveDeliverySchedule(
        user,
        this.deps.getConfig().notificationDelivery,
      )
      const decision = computeDeliveryDecision(this.now(), schedule)
      if (!decision) return false

      const episodes: HeldEpisode[] =
        request.media.type === 'show'
          ? (request.media.episodes ?? []).map((episode) => ({
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
            }))
          : []

      await db.createHeldNotification({
        user_id: user.id,
        media_type: request.media.type,
        guid: request.media.guid,
        title: request.notification.title || request.media.title,
        watchlist_item_key: request.watchlistItemKey ?? null,
        is_bulk_release: request.isBulkRelease,
        episodes,
        notification: request.notification,
        reason: decision.reason,
        deliver_after: new Date(decision.deliverAfter),
      })

      logger.info(
        {
          userId: user.id,
          title: request.notification.title,
          reason: decision.reason,
          deliverAfter: new Date(decision.deliverAfter).toISOString(),
        },
        'Held media notification for scheduled delivery',
      )
      return true
    } catch (error) {
      logger.error(
        { error, userId: request.user.id, title: request.notification.title },
        'Failed to hold notification, delivering immediately',
      )
      return false
    }
  }

  /**
   * Delivers every user's held notifications once any of them is due.
   * Concurrent calls share the in-flight run.
   *
   * @returns Number of users a digest was delivered to
   */
  flushDue(): Promise<number> {
    if (!this.flushing) {
      this.flushing = this.runFlush().finally(() => {
        this.flushing = null
      })
    }
    return this.flushing
  }

  private async runFlush(): Promise<number> {
    const { db, logger } = this.deps
    let delivered = 0

    let userIds: number[]
    try {
      userIds = await db.getUserIdsWithDueHeldNotifications(
        new Date(this.now()),
      )
    } catch (error) {
      logger.error({ error }, 'Failed to look up due held notifications')
      return 0
    }

    for (const userId of userIds) {
      try {
        const rows = await db.claimHeldNotifications(
          userId,
          new Date(this.now()),
        )
        if (rows.length === 0) continue

        try {
          const user = await db.getUser(userId)
          if (user) {
            await this.deliver(user, rows)
            delivered++
          }
        } finally {
          await db.deleteHeldNotifications(rows.map((row) => row.id))
        }
      } catch (error) {
        logger.error(
          { error, userId },
          'Failed to deliver held notifications for user',
        )
      }
    }

    return delivered
  }

  /** Sends a user's held rows on each of their enabled channels. */
  private async deliver(user: User, rows: HeldNotification[]): Promise<void> {
    const { logger, discordBot, apprise, plexMobile } = this.deps
    const titles = buildDigest(rows)
    // A lone held notification is sent exactly as it would have been
    const single = rows.length === 1 ? rows[0].notification : null
    const entries = toDigestEntries(titles)

    logger.info(
      { userId: user.id, rows: rows.length, titles: titles.length },
      'Delivering held media notifications',
    )

    if (user.notify_discord && user.discord_id) {
      try {
        if (single) {
          await discordBot.sendDirectMessage(user.discord_id, single)
        } else {
          await discordBot.sendDirectMessageEmbed(
            user.discord_id,
            createMediaDigestEmbed(entries),
          )
        }
      } catch (error) {
        logger.error(
          { error, userId: user.id, discord_id: user.discord_id },
          'Failed to send Discord digest',
        )
      }
    }

    if (user.notify_apprise && apprise.isEnabled()) {
      try {
        if (single) {
          await apprise.sendMediaNotification(user, single)
        } else {
          await apprise.sendMediaDigestNotification(user, entries)
        }
      } catch (error) {
        logger.error(
          { error, userId: user.id },
          'Failed to send Apprise digest',
        )
      }
    }

    if (user.notify_plex_mobile && plexMobile.isEnabled()) {
      for (const title of titles) {
        await this.sendPlexMobile(user, title)
      }
    }
  }

  private async sendPlexMobile(user: User, title: DigestTitle): Promise<void> {
    const { logger, plexMobile } = this.deps
    if (!title.watchlistItemKey) return

    try {
      const { notification, isBulkRelease } = toPlexMobileNotification(title)
      await plexMobile.sendMediaNotification(
        user,
        notification,
        title.watchlistItemKey,
        title.guid,
        isBulkRelease,
      )
    } catch (error) {
      logger.error(
        { error, userId: user.id, guid: title.guid },
        'Failed to send Plex mobile notification for held title',
      )
    }
  }

  /**
   * Drops deliveries interrupted by a previous shutdown, delivers anything
   * already due, then checks every FLUSH_INTERVAL_MS.
   */
  async start(): Promise<void> {
    const { db, logger } = this.deps
    if (this.stopped) return
    try {
      const interrupted = await db.deleteInterruptedHeldNotifications()
      if (interrupted > 0) {
        logger.warn(
          { count: interrupted },
          'Dropped held notifications whose delivery was interrupted by a restart; they may already have been sent',
        )
      }
    } catch (error) {
      logger.error({ error }, 'Failed to clear interrupted held notifications')
    }

    await this.flushDue()

    if (!this.timer && !this.stopped) {
      this.timer = setInterval(() => {
        void this.flushDue()
      }, FLUSH_INTERVAL_MS)
      this.timer.unref?.()
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Let an in-flight delivery finish so its rows are not left claimed
    await this.flushing
  }
}
