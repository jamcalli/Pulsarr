import type { PlexNotificationResponse } from '@schemas/plex/plex-notification-result.schema.js'
import type { PlexNotificationTarget } from '@services/plex-server/notifications/notification-target.js'
import type { FastifyBaseLogger } from 'fastify'

const CONFIGURE_TIMEOUT_MS = 5000

type PlexNotificationResult =
  PlexNotificationResponse['results']['radarr'][number]

export interface PlexNotificationRun {
  results: PlexNotificationResponse['results']
  successCount: number
  radarrSuccessCount: number
  sonarrSuccessCount: number
  instanceCount: number
}

interface PlexNotificationService {
  hasPlexNotification(): Promise<boolean>
  configurePlexNotification(
    plexToken: string,
    plexHost: string,
    plexPort: number,
    useSsl: boolean,
  ): Promise<void>
  removePlexNotification(): Promise<void>
}

interface ArrManager {
  getAllInstances(): Promise<ReadonlyArray<{ id: number; name: string }>>
}

export type PlexNotificationOutcome =
  | { kind: 'no-instances' }
  | { kind: 'done'; run: PlexNotificationRun }

/** Fastify itself satisfies this, so the service passes its instance. */
export interface PlexNotificationDeps {
  radarrManager: ArrManager & {
    getRadarrService(id: number): PlexNotificationService | undefined
  }
  sonarrManager: ArrManager & {
    getSonarrService(id: number): PlexNotificationService | undefined
  }
  log: FastifyBaseLogger
}

type InstanceOperation = (
  service: PlexNotificationService,
) => Promise<{ success: boolean; message: string }>

interface ArrSide {
  label: 'Radarr' | 'Sonarr'
  instances: ReadonlyArray<{ id: number; name: string }>
  serviceFor: (id: number) => PlexNotificationService | undefined
}

async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function runOnSide(
  side: ArrSide,
  operation: InstanceOperation,
  failure: string,
  log: FastifyBaseLogger,
): Promise<PlexNotificationResult[]> {
  const results: PlexNotificationResult[] = []
  for (const instance of side.instances) {
    const service = side.serviceFor(instance.id)
    if (!service) {
      results.push({
        id: instance.id,
        name: instance.name,
        success: false,
        message: `${side.label} service not initialized`,
      })
      continue
    }
    try {
      results.push({
        id: instance.id,
        name: instance.name,
        ...(await operation(service)),
      })
    } catch (error) {
      log.error(
        { error, instanceId: instance.id, instanceName: instance.name },
        `${failure} in ${side.label}`,
      )
      results.push({
        id: instance.id,
        name: instance.name,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
  return results
}

/** Runs `operation` on every Radarr and Sonarr instance in turn, collecting one result each. */
async function runOnArrInstances(
  deps: PlexNotificationDeps,
  operation: InstanceOperation,
  failure: string,
): Promise<PlexNotificationOutcome> {
  const radarrInstances = await deps.radarrManager.getAllInstances()
  const sonarrInstances = await deps.sonarrManager.getAllInstances()
  if (radarrInstances.length === 0 && sonarrInstances.length === 0) {
    return { kind: 'no-instances' }
  }
  const radarr = await runOnSide(
    {
      label: 'Radarr',
      instances: radarrInstances,
      serviceFor: (id) => deps.radarrManager.getRadarrService(id),
    },
    operation,
    failure,
    deps.log,
  )
  const sonarr = await runOnSide(
    {
      label: 'Sonarr',
      instances: sonarrInstances,
      serviceFor: (id) => deps.sonarrManager.getSonarrService(id),
    },
    operation,
    failure,
    deps.log,
  )
  const radarrSuccessCount = radarr.filter((r) => r.success).length
  const sonarrSuccessCount = sonarr.filter((r) => r.success).length
  return {
    kind: 'done',
    run: {
      results: { radarr, sonarr },
      successCount: radarrSuccessCount + sonarrSuccessCount,
      radarrSuccessCount,
      sonarrSuccessCount,
      instanceCount: radarr.length + sonarr.length,
    },
  }
}

export function getPlexNotificationStatus(deps: PlexNotificationDeps) {
  return runOnArrInstances(
    deps,
    async (service) => {
      const configured = await service.hasPlexNotification()
      return {
        success: configured,
        message: configured
          ? 'Plex notification is configured'
          : 'Plex notification is not configured',
      }
    },
    'Failed to check Plex notification status',
  )
}

export function configurePlexNotifications(
  deps: PlexNotificationDeps,
  target: PlexNotificationTarget,
) {
  return runOnArrInstances(
    deps,
    async (service) => {
      await withTimeout(
        service.configurePlexNotification(
          target.plexToken,
          target.plexHost,
          target.plexPort,
          target.useSsl,
        ),
        CONFIGURE_TIMEOUT_MS,
        'Timeout configuring Plex notification',
      )
      return {
        success: true,
        message: 'Plex notification configured successfully',
      }
    },
    'Failed to configure Plex notification',
  )
}

export function removePlexNotifications(deps: PlexNotificationDeps) {
  return runOnArrInstances(
    deps,
    async (service) => {
      await service.removePlexNotification()
      return {
        success: true,
        message: 'Plex notification removed successfully',
      }
    },
    'Failed to remove Plex notification',
  )
}
