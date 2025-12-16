/**
 * Notification Service
 *
 * Thin orchestrator that owns notification channels.
 * Owns Discord (bot + webhook), Tautulli, Apprise, and future channels.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { SystemNotification } from '@root/types/discord.types.js'
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
import { sendMediaAvailable } from './notifications/orchestration/media-available.js'
import { TautulliService } from './notifications/tautulli/index.js'
import { createDeleteSyncEmbed } from './notifications/templates/discord-embeds.js'

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
   * Sends a delete sync notification via webhook and/or DM.
   * Orchestration method that coordinates both channels.
   */
  async sendDeleteSyncNotification(
    results: DeleteSyncResult,
    dryRun: boolean,
    notifyOption?: string,
  ): Promise<boolean> {
    try {
      const notifySetting =
        notifyOption || this.fastify.config.deleteSyncNotify || 'none'

      this.log.info(`Delete sync notification setting: "${notifySetting}"`)

      if (notifySetting === 'none') {
        this.log.debug('Delete sync notifications disabled, skipping')
        return false
      }

      const embed = createDeleteSyncEmbed(results, dryRun)

      let successCount = 0

      const sendWebhook = [
        'all',
        'discord-only',
        'webhook-only',
        'discord-webhook',
        'discord-both',
        'webhook',
        'both',
      ].includes(notifySetting)

      const sendDM = [
        'all',
        'discord-only',
        'dm-only',
        'discord-message',
        'discord-both',
        'message',
        'both',
      ].includes(notifySetting)

      this.log.debug(
        `Will attempt to send notifications: Webhook=${sendWebhook}, DM=${sendDM}`,
      )

      // Send webhook notification
      if (sendWebhook) {
        if (!this.fastify.config.discordWebhookUrl) {
          this.log.warn(
            'Discord webhook URL not configured, cannot send webhook notification',
          )
        } else {
          try {
            const payload = {
              embeds: [embed],
              username: 'Pulsarr Delete Sync',
              avatar_url:
                'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png',
            }

            this.log.debug('Attempting to send webhook notification')
            const webhookSent =
              await this._discordWebhook.sendNotification(payload)
            if (webhookSent) {
              successCount++
              this.log.info(
                'Delete sync webhook notification sent successfully',
              )
            } else {
              this.log.warn('Failed to send delete sync webhook notification')
            }
          } catch (webhookError) {
            this.log.error(
              { error: webhookError },
              'Error sending webhook notification',
            )
          }
        }
      }

      // Send DM notification
      if (sendDM) {
        try {
          const users = await this.fastify.db.getAllUsers()
          const adminUser = users.find((user) => user.is_primary_token)

          const hasDeletedContent = results.total.deleted > 0
          const hasSkippedContent = results.total.skipped > 0
          const shouldNotify =
            dryRun ||
            hasDeletedContent ||
            hasSkippedContent ||
            results.safetyTriggered

          if (!shouldNotify) {
            this.log.info('Skipping DM notification as no activity to report')
          } else if (!adminUser) {
            this.log.warn(
              'Admin user not found - skipping delete sync DM notification',
            )
          } else if (!adminUser.discord_id) {
            this.log.warn(
              `Admin user ${adminUser.name} has no Discord ID - skipping delete sync DM notification`,
            )
          } else {
            try {
              const systemNotification: SystemNotification = {
                type: 'system',
                username: adminUser.name,
                title: embed.title || 'Delete Sync Results',
                embedFields: embed.fields || [],
                safetyTriggered: results.safetyTriggered,
              }

              this.log.debug(
                `Attempting to send DM to admin ${adminUser.name} (${adminUser.discord_id})`,
              )
              const dmSent = await this._discordBot.sendDirectMessage(
                adminUser.discord_id,
                systemNotification,
              )

              if (dmSent) {
                successCount++
                this.log.info(
                  `Sent delete sync DM notification to admin ${adminUser.name}`,
                )
              } else {
                this.log.warn(
                  `Failed to send DM to admin ${adminUser.name} (${adminUser.discord_id})`,
                )
              }
            } catch (dmError) {
              this.log.error(
                {
                  error: dmError,
                  admin: adminUser.name,
                  discordId: adminUser.discord_id,
                },
                'Failed to send delete sync DM notification to admin',
              )
            }
          }
        } catch (userError) {
          this.log.error(
            { error: userError },
            'Error retrieving users for DM notifications',
          )
        }
      }

      this.log.info(
        `Notification attempt complete: ${successCount} messages sent successfully`,
      )
      return successCount > 0
    } catch (error) {
      this.log.error({ error }, 'Error sending delete sync notification')
      return false
    }
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
