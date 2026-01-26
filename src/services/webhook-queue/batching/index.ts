/**
 * Batching Module
 *
 * Short-term in-memory batching for episode webhooks.
 * Aggregates episodes into seasons before notifying.
 */

export {
  addEpisodesToQueue,
  addEpisodeToQueue,
  clearAllTimeouts,
  type EpisodeQueueDeps,
  ensureSeasonQueue,
  ensureShowQueue,
  isEpisodeAlreadyQueued,
  type QueueManagerDeps,
} from './queue-manager.js'

export {
  clearSeasonTimeout,
  createQueueTimeout,
  resetSeasonTimeout,
  type TimeoutManagerDeps,
} from './timeout-manager.js'
