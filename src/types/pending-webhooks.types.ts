import type { WebhookPayload } from '@root/schemas/notifications/webhook.schema.js'

export interface PendingWebhook {
  id?: number
  instance_type: 'radarr' | 'sonarr'
  instance_id: number
  guid: string
  title: string
  media_type: 'movie' | 'show'
  payload: WebhookPayload // Full webhook payload
  received_at: Date
  expires_at: Date
}

export interface PendingWebhookCreate {
  instance_type: 'radarr' | 'sonarr'
  instance_id: number
  guid: string
  title: string
  media_type: 'movie' | 'show'
  payload: WebhookPayload
  expires_at: Date
}

export interface PendingWebhooksConfig {
  retryInterval: number // in seconds (default: 20)
  maxAge: number // in minutes (default: 10)
  cleanupInterval: number // in seconds (default: 60)
}
