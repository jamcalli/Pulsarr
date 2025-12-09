/**
 * Orchestration Module
 *
 * Handles high-level coordination including reconciliation and sync engine.
 */

// Friend handling
export {
  handleNewFriendEtagMode,
  handleNewFriendFullMode,
  handleRemovedFriend,
  type NewFriendHandlerResult,
  processFriendChanges,
} from './friend-handler.js'
// Sync engine
export { type SyncResult, syncWatchlistItems } from './sync-engine.js'
