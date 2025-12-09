/**
 * Health Checker Module
 *
 * Provides reusable health check and deferred queueing logic.
 * Consolidates the repeated health-check-and-queue pattern used across
 * multiple locations in the watchlist workflow service.
 */

import type { DeferredEntry } from '@services/deferred-routing-queue.service.js'
import type { HealthCheckDeps, HealthCheckResult } from '../types.js'

/**
 * Check if all Sonarr/Radarr instances are healthy.
 *
 * @param deps - Service dependencies for health checking
 * @returns Health check result with availability status and unavailable instance IDs
 */
export async function checkInstanceHealth(
  deps: HealthCheckDeps,
): Promise<HealthCheckResult> {
  const [sonarrHealth, radarrHealth] = await Promise.all([
    deps.sonarrManager.checkInstancesHealth(),
    deps.radarrManager.checkInstancesHealth(),
  ])

  const available =
    sonarrHealth.unavailable.length === 0 &&
    radarrHealth.unavailable.length === 0

  return {
    available,
    sonarrUnavailable: sonarrHealth.unavailable,
    radarrUnavailable: radarrHealth.unavailable,
  }
}

/**
 * Queue an entry for deferred routing when instances are unavailable.
 *
 * @param deps - Service dependencies including the deferred queue
 * @param entry - The entry to queue (etag change or items)
 * @param context - Description of the context for logging (e.g., 'etag-change', 'new-friend')
 * @returns true if queued successfully, false if queue not available
 */
export function queueForDeferredRouting(
  deps: HealthCheckDeps,
  entry: DeferredEntry,
  context: string,
): boolean {
  if (!deps.deferredRoutingQueue) {
    deps.logger.warn(
      { context },
      'Deferred routing queue not available, items will be lost',
    )
    return false
  }

  deps.deferredRoutingQueue.enqueue(entry)
  deps.logger.debug(
    { context, entryType: entry.type },
    'Queued for deferred routing',
  )
  return true
}

/**
 * Check instance health and queue for deferred routing if unavailable.
 * This is a convenience function combining the two operations.
 *
 * @param deps - Service dependencies
 * @param entry - The entry to queue if instances unavailable
 * @param context - Description of the context for logging
 * @returns Object with health result and whether routing should proceed
 */
export async function checkHealthAndQueueIfUnavailable(
  deps: HealthCheckDeps,
  entry: DeferredEntry,
  context: string,
): Promise<{ health: HealthCheckResult; shouldRoute: boolean }> {
  const health = await checkInstanceHealth(deps)

  if (!health.available) {
    deps.logger.warn(
      {
        context,
        sonarrUnavailable: health.sonarrUnavailable,
        radarrUnavailable: health.radarrUnavailable,
      },
      'Some instances unavailable, queuing for deferred routing',
    )
    queueForDeferredRouting(deps, entry, context)
    return { health, shouldRoute: false }
  }

  return { health, shouldRoute: true }
}
