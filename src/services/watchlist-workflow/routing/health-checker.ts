import type { DeferredEntry } from '@services/deferred-routing-queue.service.js'
import type { HealthCheckDeps, HealthCheckResult } from '../types.js'

export async function checkInstanceHealth(
  deps: HealthCheckDeps,
): Promise<HealthCheckResult> {
  const [sonarrHealth, radarrHealth] = await Promise.all([
    deps.sonarrManager.checkInstancesHealth(),
    deps.radarrManager.checkInstancesHealth(),
  ])

  let plexServerUnreachable = false
  if (deps.skipIfExistsOnPlex && deps.plexServerService) {
    const plexHealth = await deps.plexServerService.checkPlexServerHealth()
    if (!plexHealth.reachable) {
      deps.logger.warn(
        { serverName: plexHealth.serverName },
        'Plex server unreachable (skipIfExistsOnPlex is enabled)',
      )
      plexServerUnreachable = true
    }
  }

  const available =
    sonarrHealth.unavailable.length === 0 &&
    radarrHealth.unavailable.length === 0 &&
    !plexServerUnreachable

  return {
    available,
    sonarrUnavailable: sonarrHealth.unavailable,
    radarrUnavailable: radarrHealth.unavailable,
    plexServerUnreachable,
  }
}

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
        plexServerUnreachable: health.plexServerUnreachable,
      },
      'Some instances unavailable, queuing for deferred routing',
    )
    queueForDeferredRouting(deps, entry, context)
    return { health, shouldRoute: false }
  }

  return { health, shouldRoute: true }
}
