import {
  EVENT_TYPE_LABELS,
  WEBHOOK_EVENT_TYPES,
} from '@root/types/webhook-endpoint.types'

export { EVENT_TYPE_LABELS }

/**
 * Options for the event type multi-select component
 */
export const EVENT_TYPE_OPTIONS = WEBHOOK_EVENT_TYPES.map((eventType) => ({
  label: EVENT_TYPE_LABELS[eventType],
  value: eventType,
}))
