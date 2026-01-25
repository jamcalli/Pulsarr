/**
 * Batching Module
 *
 * Short-term in-memory batching for episode webhooks.
 * Aggregates episodes into seasons before notifying.
 */

export {
  clearAllTimeouts,
  isEpisodeAlreadyQueued,
  type QueueManagerDeps,
} from './queue-manager.js'
