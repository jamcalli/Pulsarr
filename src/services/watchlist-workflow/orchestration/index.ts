/**
 * Orchestration Module
 *
 * Handles high-level coordination including reconciliation and sync engine.
 */

// Friend handling
export {
  type FriendSyncResult,
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
  type NewFriendHandlerResult,
  processFriendChanges,
  syncSingleFriend,
} from './friend-handler.js'
// Reconciliation
export { reconcile } from './reconciler.js'
// Sync engine
export { type SyncResult, syncWatchlistItems } from './sync-engine.js'
