import type { WebhookPayloadMap } from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type {
  Config,
  DeleteSyncNotifyOption,
} from '@root/types/config.types.js'
import type { NotificationMessage } from '@root/types/notification.types.js'
import type { WebhookEventType } from '@root/types/webhook-endpoint.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { AppriseService } from './channels/apprise.service.js'
import type { DiscordWebhookService } from './channels/discord-webhook.service.js'
import type { PlexMobileService } from './channels/plex-mobile.service.js'
import type { DiscordBotService } from './discord-bot/bot.service.js'
import type { NotificationState } from './state.js'
import type { NotificationEvent } from './templates/labels.js'

export interface NotificationDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
  config: Config
  state: NotificationState
  discordBot: DiscordBotService
  discordWebhook: DiscordWebhookService
  apprise: AppriseService
  plexMobile: PlexMobileService
  progress: FastifyInstance['progress']
  /** Runs delivery work in the background, tracked so shutdown can drain it. */
  detach: (work: Promise<boolean>) => void
}

export type DeliveryChannel =
  | 'Discord webhook'
  | 'Discord DM'
  | 'Apprise'
  | 'Plex mobile'
  | 'Native webhook'
  | 'Public Discord webhook'
  | 'Public Apprise'

/** `summary` is what happened plus its context and follows the event label in every delivery line. */
export interface DeliveryLine {
  event: NotificationEvent
  summary: string
  userId?: number
  guid?: string
}

export interface NativeWebhook<E extends WebhookEventType> {
  event: E
  payload: WebhookPayloadMap[E]
}

export type NotificationRecordInput = Parameters<
  DatabaseService['createNotificationRecord']
>[0]

export type AdminRecord = Omit<
  NotificationRecordInput,
  | 'sent_to_discord'
  | 'sent_to_apprise'
  | 'sent_to_plex_mobile'
  | 'sent_to_native_webhook'
>

export interface DeliveryOutcome {
  sent_to_discord: boolean
  sent_to_apprise: boolean
  sent_to_plex_mobile?: boolean
  sent_to_native_webhook: boolean
}

export interface AdminNotification<E extends WebhookEventType> {
  setting: DeleteSyncNotifyOption
  line: DeliveryLine
  message: Partial<NotificationMessage>
  webhook?: NativeWebhook<E>
  record?: AdminRecord
}
