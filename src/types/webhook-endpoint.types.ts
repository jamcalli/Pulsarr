/**
 * Native Webhook Event Types
 *
 * These are the events that can trigger outbound webhooks to external systems.
 */
export const WEBHOOK_EVENT_TYPES = [
  'media.available',
  'watchlist.added',
  'watchlist.removed',
  'approval.created',
  'approval.resolved',
  'approval.auto',
  'delete_sync.completed',
  'user.created',
  'quota.cap_reached',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

/**
 * Human-readable labels for webhook event types
 */
export const EVENT_TYPE_LABELS: Record<WebhookEventType, string> = {
  'media.available': 'Media available',
  'watchlist.added': 'Watchlist added',
  'watchlist.removed': 'Watchlist removed',
  'approval.created': 'Approval created',
  'approval.resolved': 'Approval resolved',
  'approval.auto': 'Auto approved',
  'delete_sync.completed': 'Delete sync complete',
  'user.created': 'User created',
  'quota.cap_reached': 'Watchlist cap reached',
}

/**
 * Webhook endpoint (parsed from database)
 */
export interface WebhookEndpoint {
  id: number
  name: string
  url: string
  auth_header_name: string | null
  auth_header_value: string | null
  event_types: WebhookEventType[]
  enabled: boolean
  created_at: string
  updated_at: string
}

/**
 * Data required to create a new webhook endpoint
 */
export interface CreateWebhookEndpoint {
  name: string
  url: string
  authHeaderName?: string
  authHeaderValue?: string
  eventTypes: WebhookEventType[]
  enabled?: boolean
}

/**
 * Data for updating an existing webhook endpoint
 */
export interface UpdateWebhookEndpoint {
  name?: string
  url?: string
  authHeaderName?: string | null
  authHeaderValue?: string | null
  eventTypes?: WebhookEventType[]
  enabled?: boolean
}

/**
 * Base envelope for all webhook payloads
 */
export interface WebhookPayloadEnvelope<T = unknown> {
  event: WebhookEventType | 'test'
  timestamp: string // ISO 8601
  data: T
}

/**
 * Result of dispatching webhooks
 */
export interface WebhookDispatchResult {
  dispatched: number
  succeeded: number
  failed: number
  results: Array<{
    endpointId: number
    endpointName: string
    success: boolean
    error?: string
  }>
}
