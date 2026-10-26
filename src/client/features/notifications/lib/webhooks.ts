import {
  EVENT_TYPE_LABELS,
  WEBHOOK_EVENT_TYPES,
} from '@root/types/webhook-endpoint.types'
import { formatList } from '@/lib/format'
import { DOCS_ROOT } from '@/lib/navigation'
import type { components } from '@/types/api.js'

type WebhookEventType = components['schemas']['WebhookEventType']
type WebhookEndpoint = components['schemas']['WebhookEndpoint']

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> =
  EVENT_TYPE_LABELS

export const WEBHOOK_PAYLOADS_DOCS_URL = `${DOCS_ROOT}/api/webhook-payloads`

/** The events in list order. */
export function sortEventTypes(
  types: readonly WebhookEventType[],
): WebhookEventType[] {
  return WEBHOOK_EVENT_TYPES.filter((type) => types.includes(type))
}

export function deleteEndpointDescription(endpoint: WebhookEndpoint): string {
  const events = formatList(
    sortEventTypes(endpoint.eventTypes).map(
      (type) => WEBHOOK_EVENT_LABELS[type],
    ),
  )
  return `${endpoint.name} stops receiving ${events}. You can't undo this.`
}
