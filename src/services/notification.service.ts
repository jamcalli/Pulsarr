/**
 * Notification Service
 *
 * Thin orchestrator that owns notification channels.
 * Owns Discord (bot + webhook), Tautulli, Apprise, and future channels.
 */

import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { User } from '@root/types/config.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Friend, Item as WatchlistItem } from '@root/types/plex.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import type {
  WebhookDispatchResult,
  WebhookEventType,
} from '@root/types/webhook-endpoint.types.js'
import { parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  AppriseService,
  DiscordWebhookService,
  dispatchWebhooks,
} from './notifications/channels/index.js'
import {
  type BotStatus,
  DiscordBotService,
} from './notifications/discord-bot/index.js'
import {
  type ApprovalRequest as ApprovalRequestNotification,
  sendApprovalBatch,
  sendDeleteSyncCompleted,
  sendMediaAvailable,
  sendWatchlistAdded,
  type WatchlistItemInfo,
} from './notifications/orchestration/index.js'
import { TautulliService } from './notifications/tautulli/index.js'

/**
 * Notification Service
 *
 * Owns all notification channels and provides lifecycle management.
 * Single decoration point: fastify.notifications
 */
export class NotificationService {
  private readonly log: FastifyBaseLogger
  private readonly _discordBot: DiscordBotService
  private readonly _discordWebhook: DiscordWebhookService
  private readonly _tautulli: TautulliService
  private readonly _apprise: AppriseService

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'NOTIFICATIONS')
    this.log.debug('Initializing notification service')

    // Create Discord services
    this._discordBot = new DiscordBotService(this.log, this.fastify)
    this._discordWebhook = new DiscordWebhookService(this.log, this.fastify)

    // Create Tautulli service
    this._tautulli = new TautulliService(this.log, this.fastify)

    // Create Apprise service
    this._apprise = new AppriseService(this.log, this.fastify)
  }

  /**
   * Discord bot accessor for bot lifecycle and DMs.
   */
  get discordBot(): DiscordBotService {
    return this._discordBot
  }

  /**
   * Discord webhook accessor for stateless webhook operations.
   */
  get discordWebhook(): DiscordWebhookService {
    return this._discordWebhook
  }

  /**
   * Tautulli service accessor for mobile push notifications.
   */
  get tautulli(): TautulliService {
    return this._tautulli
  }

  /**
   * Apprise service accessor for Apprise notifications.
   */
  get apprise(): AppriseService {
    return this._apprise
  }

  /**
   * Get Discord bot status.
   * Convenience method for status emission.
   */
  getBotStatus(): BotStatus {
    return this._discordBot.getBotStatus()
  }

  /**
   * Check if Discord bot config is present.
   */
  get hasBotConfig(): boolean {
    const required = ['discordBotToken', 'discordClientId'] as const
    return required.every((key) => Boolean(this.fastify.config[key]))
  }

  /**
   * Initialize all notification channels.
   * Called from plugin onReady hook.
   */
  async initialize(): Promise<void> {
    // Initialize Discord bot if configured
    if (this.hasBotConfig) {
      this.log.info('Discord bot configuration found, attempting auto-start')
      try {
        const started = await this._discordBot.startBot()
        if (!started) {
          this.log.warn('Failed to auto-start Discord bot')
        }
      } catch (error) {
        this.log.error({ error }, 'Error during Discord bot auto-start')
      }
    } else {
      this.log.debug(
        'Discord bot configuration incomplete, bot features will require manual initialization',
      )
    }

    // Initialize Tautulli if configured
    try {
      await this._tautulli.initialize()
    } catch (error) {
      this.log.error({ error }, 'Failed to initialize Tautulli service')
    }

    // Initialize Apprise (fire-and-forget to avoid blocking startup)
    // The initialization includes a 5-second delay to allow Apprise container to fully start
    this._apprise.initialize().catch((error) => {
      this.log.error({ error }, 'Unexpected error in Apprise initialization')
    })
  }

  /**
   * Shutdown all notification channels.
   * Called from plugin onClose hook.
   */
  async shutdown(): Promise<void> {
    // Shutdown Discord bot
    if (this._discordBot.getBotStatus() === 'running') {
      this.log.info('Stopping Discord bot during shutdown')
      await this._discordBot.stopBot()
    }

    // Shutdown Tautulli
    await this._tautulli.shutdown()
  }

  /**
   * Sends a delete sync notification via webhook, DM, and/or Apprise.
   * Orchestration method that coordinates all channels based on configuration.
   *
   * @param results - Delete sync operation results
   * @param dryRun - Whether this was a dry run
   * @param notifyOption - Override for notification setting (uses config default if not provided)
   * @returns Promise resolving to boolean indicating if any notifications were sent
   */
  async sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
    notifyOption?: string,
  ): Promise<boolean> {
    return sendDeleteSyncCompleted(
      {
        db: this.fastify.db,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
        config: {
          deleteSyncNotify:
            notifyOption || this.fastify.config.deleteSyncNotify || 'none',
          deleteSyncNotifyOnlyOnDeletion:
            this.fastify.config.deleteSyncNotifyOnlyOnDeletion || false,
          discordWebhookUrl: this.fastify.config.discordWebhookUrl,
        },
      },
      results,
      dryRun,
    )
  }

  /**
   * Sends watchlist addition notifications to admin channels.
   * Notifies admins via Discord webhook and/or Apprise when a user adds content.
   *
   * @param user - User who added the item
   * @param item - Watchlist item details
   * @param routingDetails - Optional routing information from the content router
   * @returns Promise resolving to boolean indicating if any notifications were sent
   */
  async sendWatchlistAdded(
    user: Friend & { userId: number },
    item: WatchlistItemInfo,
    routingDetails?: {
      instanceId: number
      instanceType: 'radarr' | 'sonarr'
      qualityProfile?: number | string | null
      rootFolder?: string | null
      tags?: string[]
      searchOnAdd?: boolean | null
      minimumAvailability?: string | null
      seasonMonitoring?: string | null
      seriesType?: string | null
    },
  ): Promise<boolean> {
    return sendWatchlistAdded(
      {
        db: this.fastify.db,
        logger: this.log,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
      },
      user,
      item,
      routingDetails,
    )
  }

  /**
   * Sends approval batch notifications to configured channels.
   * Called by ApprovalService after its debounce timer fires.
   *
   * @param queuedRequests - Approval requests to notify about
   * @param totalPending - Total pending approval count
   * @returns Promise resolving to number of channels that sent successfully
   */
  async sendApprovalBatch(
    queuedRequests: ApprovalRequestNotification[],
    totalPending: number,
  ): Promise<number> {
    return sendApprovalBatch(
      {
        db: this.fastify.db,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        apprise: this._apprise,
        config: {
          approvalNotify: this.fastify.config.approvalNotify || 'none',
        },
      },
      queuedRequests,
      totalPending,
    )
  }

  /**
   * Sends media available notifications to all relevant users and public channels.
   *
   * Orchestration method that:
   * 1. Looks up all users who watchlisted this content
   * 2. Checks each user's notification preferences
   * 3. Creates notification records in the database
   * 4. Dispatches to all enabled channels (Discord, Apprise, Tautulli)
   * 5. Handles public channel notifications if configured
   *
   * @param mediaInfo - Information about the available media
   * @param options - Processing options
   * @returns Promise resolving to matched count
   */
  async sendMediaAvailable(
    mediaInfo: {
      type: 'movie' | 'show'
      guid: string
      title: string
      episodes?: SonarrEpisodeSchema[]
    },
    options: {
      isBulkRelease: boolean
      instanceId?: number
      instanceType?: 'sonarr' | 'radarr'
      sequential?: boolean
    },
  ): Promise<{ matchedCount: number }> {
    return sendMediaAvailable(
      {
        db: this.fastify.db,
        config: this.fastify.config,
        logger: this.log,
        discordBot: this._discordBot,
        discordWebhook: this._discordWebhook,
        tautulli: this._tautulli,
        apprise: this._apprise,
      },
      mediaInfo,
      options,
    )
  }

  /**
   * Dispatches a native webhook event to all configured endpoints.
   *
   * This is a fire-and-forget method - errors are logged but not thrown.
   * Use this for events that should trigger external webhooks without
   * blocking the main operation.
   *
   * @param eventType - The type of event being dispatched
   * @param data - The event payload data
   * @returns Promise resolving to dispatch result with statistics
   */
  async sendNativeWebhook<T>(
    eventType: WebhookEventType,
    data: T,
  ): Promise<WebhookDispatchResult> {
    return dispatchWebhooks(eventType, data, {
      db: this.fastify.db,
      log: this.log,
    })
  }

  // ==========================================================================
  // New Event Methods (Native Webhook Only for Now)
  // ==========================================================================

  /**
   * Sends approval resolved notification when an admin approves or rejects a request.
   *
   * @param request - The approval request that was resolved
   * @param resolution - Whether it was approved or denied
   * @param resolvedBy - User ID of the admin who resolved it
   * @param notes - Optional notes from the admin
   * @returns Promise resolving to boolean indicating if notification was sent
   */
  async sendApprovalResolved(
    request: ApprovalRequest,
    resolution: 'approved' | 'denied',
    resolvedBy: number,
    notes?: string,
  ): Promise<boolean> {
    const payload = {
      approvalId: request.id,
      // Map internal 'denied' status to 'rejected' for webhook payload
      status: resolution === 'denied' ? 'rejected' : resolution,
      content: {
        title: request.contentTitle,
        type: request.contentType,
        key: request.contentKey,
        guids: request.contentGuids,
      },
      requestedBy: {
        userId: request.userId,
        username: request.userName,
      },
      resolvedBy: {
        userId: resolvedBy,
      },
      approvalNotes: notes,
      triggeredBy: request.triggeredBy,
      createdAt: request.createdAt,
      resolvedAt: request.updatedAt,
    }

    const result = await dispatchWebhooks('approval.resolved', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    // Create notification record
    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: request.userId,
          type: 'approval_resolved',
          title: request.contentTitle,
          message: `Approval ${resolution}: ${request.contentTitle}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, requestId: request.id },
          'Failed to record approval resolved notification',
        )
      }
    }

    return result.succeeded > 0
  }

  /**
   * Sends auto-approval notification when content is auto-approved.
   * Called from ContentRouterService.createAutoApprovalRecord() with full routing context.
   *
   * @param request - The approval request that was auto-approved
   * @param routing - The routing configuration that was applied
   * @param reason - Reason for auto-approval
   * @returns Promise resolving to boolean indicating if notification was sent
   */
  async sendApprovalAuto(
    request: ApprovalRequest,
    routing: {
      instanceType: 'radarr' | 'sonarr'
      instanceId: number
      qualityProfile: number | string | null
      rootFolder: string | null
      tags: string[]
    },
    reason: string,
  ): Promise<boolean> {
    const payload = {
      approvalId: request.id,
      content: {
        title: request.contentTitle,
        type: request.contentType,
        key: request.contentKey,
        guids: request.contentGuids,
      },
      user: {
        userId: request.userId,
        username: request.userName,
      },
      routing: {
        instanceType: routing.instanceType,
        instanceId: routing.instanceId,
        qualityProfile: routing.qualityProfile,
        rootFolder: routing.rootFolder,
        tags: routing.tags,
      },
      reason,
    }

    const result = await dispatchWebhooks('approval.auto', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    // Create notification record
    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: request.userId,
          type: 'approval_auto',
          title: request.contentTitle,
          message: `Auto-approved: ${request.contentTitle}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, requestId: request.id },
          'Failed to record auto-approval notification',
        )
      }
    }

    return result.succeeded > 0
  }

  /**
   * Sends watchlist removed notification when a user removes content from their watchlist.
   *
   * @param userId - The user who removed the item
   * @param username - The username of the user
   * @param item - The watchlist item that was removed
   * @returns Promise resolving to boolean indicating if notification was sent
   */
  async sendWatchlistRemoved(
    userId: number,
    username: string,
    item: WatchlistItem & { id: number },
  ): Promise<boolean> {
    const guids =
      typeof item.guids === 'string' ? parseGuids(item.guids) : item.guids

    const payload = {
      watchlistItemId: item.id,
      content: {
        title: item.title,
        type: item.type === 'show' ? 'show' : 'movie',
        key: item.key,
        guids,
      },
      removedBy: {
        userId,
        username,
      },
    }

    const result = await dispatchWebhooks('watchlist.removed', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    // Create notification record
    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: item.id,
          user_id: userId,
          type: 'watchlist_removed',
          title: item.title,
          message: `Removed from watchlist: ${item.title}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, userId, title: item.title },
          'Failed to record watchlist removed notification',
        )
      }
    }

    return result.succeeded > 0
  }

  /**
   * Sends user created notification when a new user is added.
   *
   * @param user - The user that was created
   * @returns Promise resolving to boolean indicating if notification was sent
   */
  async sendUserCreated(user: User): Promise<boolean> {
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        alias: user.alias ?? null,
        discordId: user.discord_id ?? null,
        apprise: user.apprise ?? null,
      },
      settings: {
        canSync: user.can_sync ?? true,
        requiresApproval: user.requires_approval ?? false,
        notifyDiscord: user.notify_discord ?? false,
        notifyApprise: user.notify_apprise ?? false,
        notifyTautulli: user.notify_tautulli ?? false,
        tautulliNotifierId: user.tautulli_notifier_id ?? null,
      },
      createdAt: user.created_at ?? new Date().toISOString(),
    }

    const result = await dispatchWebhooks('user.created', payload, {
      db: this.fastify.db,
      log: this.log,
    })

    // Create notification record
    if (result.succeeded > 0) {
      try {
        await this.fastify.db.createNotificationRecord({
          watchlist_item_id: null,
          user_id: user.id,
          type: 'user_created',
          title: user.name,
          message: `New user created: ${user.name}`,
          sent_to_discord: false,
          sent_to_apprise: false,
          sent_to_native_webhook: true,
        })
      } catch (error) {
        this.log.error(
          { error, userId: user.id },
          'Failed to record user created notification',
        )
      }
    }

    return result.succeeded > 0
  }
}
