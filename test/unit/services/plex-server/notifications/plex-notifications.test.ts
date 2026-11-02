import {
  configurePlexNotifications,
  getPlexNotificationStatus,
  type PlexNotificationDeps,
  type PlexNotificationOutcome,
  removePlexNotifications,
} from '@services/plex-server/notifications/plex-notifications.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

interface FakeService {
  hasPlexNotification: () => Promise<boolean>
  configurePlexNotification: () => Promise<void>
  removePlexNotification: () => Promise<void>
}

function fakeService(overrides: Partial<FakeService> = {}) {
  return {
    hasPlexNotification: vi.fn(async () => true),
    configurePlexNotification: vi.fn(async () => {}),
    removePlexNotification: vi.fn(async () => {}),
    ...overrides,
  }
}

function deps({
  radarr = [{ id: 1, name: 'Radarr' }],
  sonarr = [{ id: 2, name: 'Sonarr' }],
  radarrService = fakeService(),
  sonarrService = fakeService(),
  sonarrRunning = true,
}: {
  radarr?: Array<{ id: number; name: string }>
  sonarr?: Array<{ id: number; name: string }>
  radarrService?: ReturnType<typeof fakeService>
  sonarrService?: ReturnType<typeof fakeService>
  sonarrRunning?: boolean
} = {}): PlexNotificationDeps {
  return {
    radarrManager: {
      getAllInstances: async () => radarr,
      getRadarrService: () => radarrService,
    },
    sonarrManager: {
      getAllInstances: async () => sonarr,
      getSonarrService: () => (sonarrRunning ? sonarrService : undefined),
    },
    log: createMockLogger(),
  }
}

function doneRun(outcome: PlexNotificationOutcome) {
  if (outcome.kind !== 'done')
    throw new Error(`Expected a run, got ${outcome.kind}`)
  return outcome.run
}

describe('plex notifications across Radarr and Sonarr', () => {
  it('reports no instances when none exist', async () => {
    expect(
      await getPlexNotificationStatus(deps({ radarr: [], sonarr: [] })),
    ).toEqual({ kind: 'no-instances' })
  })

  it('reports each instance status and counts the configured ones', async () => {
    const run = doneRun(
      await getPlexNotificationStatus(
        deps({
          sonarrService: fakeService({
            hasPlexNotification: vi.fn(async () => false),
          }),
        }),
      ),
    )

    expect(run.results.radarr).toEqual([
      expect.objectContaining({ id: 1, success: true }),
    ])
    expect(run.results.sonarr).toEqual([
      expect.objectContaining({ id: 2, success: false }),
    ])
    expect(run.successCount).toBe(1)
    expect(run.instanceCount).toBe(2)
  })

  it('marks an instance without a running service as failed', async () => {
    const run = doneRun(
      await removePlexNotifications(deps({ sonarrRunning: false })),
    )

    expect(run.results.sonarr).toEqual([
      {
        id: 2,
        name: 'Sonarr',
        success: false,
        message: 'Sonarr service not initialized',
      },
    ])
  })

  it('keeps going after one instance throws', async () => {
    const run = doneRun(
      await removePlexNotifications(
        deps({
          radarrService: fakeService({
            removePlexNotification: vi.fn(async () => {
              throw new Error('Radarr refused')
            }),
          }),
        }),
      ),
    )

    expect(run.results.radarr[0]).toMatchObject({
      success: false,
      message: 'Radarr refused',
    })
    expect(run.results.sonarr[0]).toMatchObject({ success: true })
  })

  it('passes the target to every instance', async () => {
    const radarrService = fakeService()
    await configurePlexNotifications(deps({ radarrService }), {
      plexToken: 'token',
      plexHost: 'plex.local',
      plexPort: 32400,
      useSsl: false,
    })

    expect(radarrService.configurePlexNotification).toHaveBeenCalledWith(
      'token',
      'plex.local',
      32400,
      false,
    )
  })

  it('reports the outcome of a slow configure instead of a timeout', async () => {
    vi.useFakeTimers()
    try {
      const pending = configurePlexNotifications(
        deps({
          radarrService: fakeService({
            configurePlexNotification: vi.fn(
              () => new Promise<void>((resolve) => setTimeout(resolve, 6000)),
            ),
          }),
        }),
        { plexToken: 't', plexHost: 'h', plexPort: 1, useSsl: false },
      )
      await vi.advanceTimersByTimeAsync(6000)
      const run = doneRun(await pending)

      expect(run.results.radarr[0]).toMatchObject({
        success: true,
        message: 'Plex notification configured successfully',
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
