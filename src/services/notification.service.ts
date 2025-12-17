/**
 * Notification Service
 *
 * Thin orchestrator that owns notification channels.
 * Owns Discord (bot + webhook), Tautulli, Apprise, and future channels.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Friend } from '@root/types/plex.types.js'
import type { SonarrEpisodeSchema } from '@root/types/sonarr.types.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  AppriseService,
  DiscordWebhookService,
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
   * @returns Promise resolving to boolean indicating if any notifications were sent
   */
  async sendWatchlistAdded(
    user: Friend & { userId: number },
    item: WatchlistItemInfo,
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
}
