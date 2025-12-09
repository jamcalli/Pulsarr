/**
 * Routing Module
 *
 * Handles content routing to Sonarr/Radarr and health checking.
 */

export {
  checkHealthAndQueueIfUnavailable,
  checkInstanceHealth,
  queueForDeferredRouting,
} from './health-checker.js'
