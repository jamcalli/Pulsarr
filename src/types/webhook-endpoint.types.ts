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
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

/**
 * Human-readable labels for webhook event types
 */
export const EVENT_TYPE_LABELS: Record<WebhookEventType, string> = {
  'media.available': 'Media Available',
  'watchlist.added': 'Watchlist Added',
  'watchlist.removed': 'Watchlist Removed',
  'approval.created': 'Approval Created',
  'approval.resolved': 'Approval Resolved',
  'approval.auto': 'Auto Approved',
  'delete_sync.completed': 'Delete Sync Complete',
  'user.created': 'User Created',
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

/**
 * Result of testing a webhook endpoint
 */
export interface TestWebhookResult {
  success: boolean
  statusCode?: number
  responseTime: number // milliseconds
  error?: string
}
