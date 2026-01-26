/**
 * Processing Module
 *
 * Queue processing and notification dispatch logic.
 */

export {
  type NotificationHandlerDeps,
  notifyOrQueueShow,
  type SyncSuppressionDeps,
  shouldSuppressRadarrNotification,
} from './notification-handler.js'
export {
  processQueuedWebhooks,
  type QueueProcessorDeps,
} from './queue-processor.js'
