/**
 * ETag Module
 *
 * Handles ETag-based change detection and staggered polling.
 */

export { buildEtagUserInfoFromMap } from './helpers.js'

export {
  getEtagFriendsList,
  handleStaggeredPollResult,
  refreshFriendsForStaggeredPolling,
} from './staggered-poller.js'
