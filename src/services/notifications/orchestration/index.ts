/**
 * Notification Orchestration Module
 *
 * Re-exports orchestration functions for different notification types.
 */

export {
  type ApprovalNotificationChannels,
  type ApprovalRequest,
  createAppriseApprovalPayload,
  createApprovalWebhookEmbed,
  createBatchedDMFields,
  formatTriggerReason,
  getApprovalNotificationChannels,
} from './approval.js'

export {
  type DeleteSyncDeps,
  sendDeleteSyncCompleted,
} from './delete-sync.js'

export {
  determineNotificationType,
  extractUserDiscordIds,
  getPublicContentNotificationFlags,
  type MediaAvailableDeps,
  type MediaAvailableOptions,
  type MediaInfo,
  sendMediaAvailable,
} from './media-available.js'

export {
  sendWatchlistAdded,
  type WatchlistAddedDeps,
  type WatchlistItemInfo,
} from './watchlist-added.js'
