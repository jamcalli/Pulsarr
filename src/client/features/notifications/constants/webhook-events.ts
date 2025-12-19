import { WEBHOOK_EVENT_TYPES } from '@root/types/webhook-endpoint.types'

/**
 * Human-readable labels for webhook event types
 */
export const EVENT_TYPE_LABELS: Record<
  (typeof WEBHOOK_EVENT_TYPES)[number],
  string
> = {
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
 * Options for the event type multi-select component
 */
export const EVENT_TYPE_OPTIONS = WEBHOOK_EVENT_TYPES.map((eventType) => ({
  label: EVENT_TYPE_LABELS[eventType],
  value: eventType,
}))
