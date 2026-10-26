import type { DiscordWebhookPayload } from '@root/types/discord.types.js'
import type {
  DeliveryResult,
  NotificationTestResult,
} from '@root/types/notification.types.js'
import type { FastifyBaseLogger } from 'fastify'
import {
  type DiscordWebhookDeps,
  sendNotification,
  testNotification,
  validateWebhooks,
  type WebhookValidationOutcome,
} from './discord-webhook.js'
import { timeTest } from './time-test.js'

export class DiscordWebhookService {
  constructor(private readonly log: FastifyBaseLogger) {}

  private get webhookDeps(): DiscordWebhookDeps {
    return { logger: this.log }
  }

  async sendNotification(
    target: string | null | undefined,
    payload: DiscordWebhookPayload,
  ): Promise<DeliveryResult> {
    return sendNotification(target, payload, this.webhookDeps)
  }

  async testNotification(url: string): Promise<NotificationTestResult> {
    return timeTest(() => testNotification(url, this.webhookDeps))
  }

  async validateWebhooks(input: string): Promise<WebhookValidationOutcome> {
    return validateWebhooks(input, this.webhookDeps)
  }
}
