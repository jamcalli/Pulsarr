/**
 * Tautulli Queue Domain
 *
 * Handles the notification queue and polling system.
 */

export {
  cleanupExpiredNotifications,
  generateNotificationKey,
  MAX_AGE_MS,
  MAX_ATTEMPTS,
  POLL_INTERVAL_MS,
  type QueueDeps,
  queueNotification,
} from './notification-queue.js'

export {
  createPollingState,
  type PollingDeps,
  type PollingState,
  processPendingNotifications,
  startPolling,
  stopPolling,
} from './polling.js'
