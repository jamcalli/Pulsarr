/**
 * Why a watchlist item did not reach Radarr or Sonarr.
 *
 * - arr_error: the instance rejected the add (validation error, bad ID, missing root folder)
 * - instance_unavailable: the instance could not be reached or is not set up
 * - no_route: no rule matched and no usable default instance exists
 * - routing_error: routing itself threw before an add was attempted
 * - missing_ids: the item has no TMDB/TVDB ID, so it can never be added (webisodes, specials)
 */
export const ROUTING_FAILURE_CATEGORIES = [
  'arr_error',
  'instance_unavailable',
  'no_route',
  'routing_error',
  'missing_ids',
] as const

export type RoutingFailureCategory = (typeof ROUTING_FAILURE_CATEGORIES)[number]

/** Permanent and harmless, so these never count toward the attention badge. */
export const LOW_SEVERITY_ROUTING_FAILURES: ReadonlySet<RoutingFailureCategory> =
  new Set(['missing_ids'])

/** Identifies a user's watchlist item in sets of failed items. */
export function routingFailureKey(userId: number, key: string): string {
  return `${userId}:${key}`
}

/** Item-level failures carry no instanceId. */
export interface RoutingFailureInput {
  category: RoutingFailureCategory
  message: string
  instanceId?: number
}

export interface RoutingFailure {
  id: number
  watchlist_item_id: number
  user_id: number
  username: string
  key: string
  title: string
  type: string
  thumb: string | null
  instance_type: 'radarr' | 'sonarr' | null
  instance_id: number | null
  instance_name: string | null
  category: RoutingFailureCategory
  message: string
  first_failed_at: string
  last_failed_at: string
  attempt_count: number
}

export interface RoutingFailureFilters {
  userId?: number
  category?: RoutingFailureCategory
}

export interface RoutingFailureSummary {
  total: number
  actionable: number
  byCategory: Record<RoutingFailureCategory, number>
  byUser: Array<{ userId: number; total: number; actionable: number }>
}
