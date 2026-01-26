/**
 * Webhook Queue Module
 *
 * Re-exports from submodules for webhook queue functionality.
 */

// Batching
export {
  addEpisodesToQueue,
  addEpisodeToQueue,
  clearAllTimeouts,
  clearSeasonTimeout,
  createQueueTimeout,
  type EpisodeQueueDeps,
  ensureSeasonQueue,
  ensureShowQueue,
  isEpisodeAlreadyQueued,
  type QueueManagerDeps,
  resetSeasonTimeout,
  type TimeoutManagerDeps,
} from './batching/index.js'

// Detection
export {
  type EpisodeCheckerDeps,
  fetchExpectedEpisodeCount,
  isRecentEpisode,
  isSeasonComplete,
  type SeasonCompletionDeps,
} from './detection/index.js'

// Persistence
export {
  cleanupExpiredWebhooks,
  type PendingStoreDeps,
  type PendingWebhookParams,
  processPendingWebhooks,
  queuePendingWebhook,
  type RetryProcessorDeps,
} from './persistence/index.js'

// Processing
export {
  type NotificationHandlerDeps,
  notifyOrQueueShow,
  processQueuedWebhooks,
  type QueueProcessorDeps,
  type SyncSuppressionDeps,
  shouldSuppressRadarrNotification,
} from './processing/index.js'
