/**
 * Discord Webhook Service
 *
 * Thin wrapper exposing stateless webhook functions.
 * Constructs deps internally, delegates to pure functions.
 */

import type {
  DiscordWebhookPayload,
  MediaNotification,
} from '@root/types/discord.types.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  type DiscordWebhookDeps,
  sendMediaNotification as sendMediaWebhook,
  sendPublicNotification as sendPublicWebhook,
  sendWebhookNotification,
  validateWebhook as validateWebhookUrl,
} from './discord-webhook.js'

/**
 * Discord Webhook Service
 *
 * Thin wrapper for Discord webhook operations.
 * Follows the deps getter pattern - constructs deps from constructor args,
 * delegates to pure functions in discord-webhook.ts.
 */
export class DiscordWebhookService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {}

  /**
   * Constructs deps from instance state.
   * Following plex-label-sync pattern for deps getters.
   */
  private get webhookDeps(): DiscordWebhookDeps {
    return {
      log: this.log,
      config: this.fastify.config,
      lookupUserAlias: async (username: string) => {
        const users = await this.fastify.db.getAllUsers()
        const user = users.find((u) => u.name === username)
        return user?.alias ?? undefined
      },
    }
  }

  /**
   * Sends a webhook notification to configured Discord endpoints.
   */
  async sendNotification(
    payload: DiscordWebhookPayload,
    overrideUrls?: string[],
  ): Promise<boolean> {
    return sendWebhookNotification(payload, this.webhookDeps, overrideUrls)
  }

  /**
   * Sends a public content notification with @ mentions.
   */
  async sendPublicNotification(
    notification: MediaNotification,
    userDiscordIds?: string[],
  ): Promise<boolean> {
    return sendPublicWebhook(notification, userDiscordIds, this.webhookDeps)
  }

  /**
   * Sends a media notification to admin webhook.
   */
  async sendMediaNotification(
    notification: MediaNotification,
  ): Promise<boolean> {
    return sendMediaWebhook(notification, this.webhookDeps)
  }

  /**
   * Validates a Discord webhook URL.
   */
  async validateWebhook(
    url: string,
  ): Promise<{ valid: boolean; error?: string }> {
    return validateWebhookUrl(url, this.log)
  }
}
