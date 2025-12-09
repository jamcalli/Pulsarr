/**
 * Routing Module
 *
 * Handles content routing to Sonarr/Radarr and health checking.
 */

// Content routing
export {
  type RouteContentResult,
  type RouteMovieParams,
  type RouteShowParams,
  routeMovie,
  routeShow,
} from './content-router.js'
// Health checking
export {
  checkHealthAndQueueIfUnavailable,
  checkInstanceHealth,
  queueForDeferredRouting,
} from './health-checker.js'
// Helpers
export { hasUserField } from './helpers.js'
// Item routing
export {
  type RouteSingleItemParams,
  routeEnrichedItemsForUser,
  routeNewItemsForUser,
  routeSingleItem,
} from './item-router.js'
