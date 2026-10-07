import type { ApprovalStatus } from '@root/types/approval.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  routeMovie,
  routeShow,
} from '@services/watchlist-workflow/routing/content-router.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
import { describe, expect, it, vi } from 'vitest'
import {
  echoAppliedRadarr,
  echoAppliedSonarr,
} from '../../../../mocks/applied-routing.js'
import { createWorkflowDeps } from '../../../../mocks/watchlist-workflow-deps.js'

const SONARR_ITEM: SonarrItem = {
  title: 'Show',
  type: 'show',
  guids: ['tvdb:123'],
}

const RADARR_ITEM: RadarrItem = {
  title: 'Movie',
  type: 'movie',
  guids: ['tmdb:456'],
}

interface RecordFake {
  status: ApprovalStatus
  proposedRouterDecision: {
    approval: {
      proposedRouting: { instanceId: number; rootFolder: string }
      additionalRouting?: { instanceId: number; rootFolder: string }[]
    }
  }
}

function recordNaming(
  status: ApprovalStatus,
  ...instanceIds: number[]
): RecordFake {
  const [primary, ...additional] = instanceIds.map((instanceId) => ({
    instanceId,
    rootFolder: `/stored-${instanceId}`,
  }))
  return {
    status,
    proposedRouterDecision: {
      approval: { proposedRouting: primary, additionalRouting: additional },
    },
  }
}

function buildDeps(
  byInstance: ExistenceCheckResult[],
  record: RecordFake | null = null,
): ContentRoutingDeps {
  const instanceIds = byInstance.map((_, index) => index + 1)
  const existence = async (instanceId: number) => byInstance[instanceId - 1]
  return createWorkflowDeps({
    db: {
      getApprovalRequestByContent: vi.fn().mockResolvedValue(record),
    },
    contentRouter: {
      getTargetInstances: vi.fn(async () => ({ instanceIds })),
      routeContent: vi.fn(async () => ({
        routedInstances: [1],
        routingDetails: [],
      })),
    },
    sonarrManager: {
      seriesExistsByTvdbId: vi.fn(existence),
      routeItemToSonarr: vi.fn(echoAppliedSonarr()),
    },
    radarrManager: {
      movieExistsByTmdbId: vi.fn(existence),
      routeItemToRadarr: vi.fn(echoAppliedRadarr()),
    },
  })
}

describe('routeShow API existence check', () => {
  let deps: ContentRoutingDeps

  function route() {
    return routeShow(
      {
        tempItem: {
          title: 'Show',
          key: 'show-key',
          type: 'show',
          guids: ['tvdb:123'],
        },
        userId: 1,
        userName: undefined,
        sonarrItem: SONARR_ITEM,
        primaryUser: null,
      },
      deps,
    )
  }

  it('skips a show that is an import list exclusion', async () => {
    deps = buildDeps([
      {
        found: true,
        checked: true,
        excluded: true,
        serviceName: 'Sonarr',
      },
    ])

    const result = await route()

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('routes a show that is not found', async () => {
    deps = buildDeps([{ found: false, checked: true, serviceName: 'Sonarr' }])

    const result = await route()

    expect(result).toEqual({ routed: true })
    expect(deps.contentRouter.routeContent).toHaveBeenCalledTimes(1)
  })

  it('skips a show when one of several targets could not be checked', async () => {
    deps = buildDeps([
      { found: false, checked: false, serviceName: 'Sonarr' },
      { found: false, checked: true, serviceName: 'Sonarr' },
    ])

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips a show when no instance could be checked', async () => {
    deps = buildDeps([{ found: false, checked: false, serviceName: 'Sonarr' }])

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })
})

describe('routeMovie API existence check', () => {
  let deps: ContentRoutingDeps

  function route() {
    return routeMovie(
      {
        tempItem: {
          title: 'Movie',
          key: 'movie-key',
          type: 'movie',
          guids: ['tmdb:456'],
        },
        userId: 1,
        userName: undefined,
        radarrItem: RADARR_ITEM,
        primaryUser: null,
      },
      deps,
    )
  }

  it('skips a movie that is an import list exclusion', async () => {
    deps = buildDeps([
      {
        found: true,
        checked: true,
        excluded: true,
        serviceName: 'Radarr',
      },
    ])

    const result = await route()

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('routes a movie that is not found', async () => {
    deps = buildDeps([{ found: false, checked: true, serviceName: 'Radarr' }])

    const result = await route()

    expect(result).toEqual({ routed: true })
    expect(deps.contentRouter.routeContent).toHaveBeenCalledTimes(1)
  })

  it('skips a movie when one of several targets could not be checked', async () => {
    deps = buildDeps([
      { found: false, checked: false, serviceName: 'Radarr' },
      { found: false, checked: true, serviceName: 'Radarr' },
    ])

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips a movie when no instance could be checked', async () => {
    deps = buildDeps([{ found: false, checked: false, serviceName: 'Radarr' }])

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })
})

const FOUND: ExistenceCheckResult = {
  found: true,
  checked: true,
  serviceName: 'Arr',
}
const MISSING: ExistenceCheckResult = {
  found: false,
  checked: true,
  serviceName: 'Arr',
}

const ROUTERS = [
  {
    contentType: 'show',
    added: (deps: ContentRoutingDeps) =>
      vi.mocked(deps.sonarrManager.routeItemToSonarr).mock.calls,
    route: (deps: ContentRoutingDeps, presentIn?: number[]) =>
      routeShow(
        {
          tempItem: {
            title: 'Show',
            key: 'show-key',
            type: 'show',
            guids: ['tvdb:123'],
          },
          userId: 1,
          userName: undefined,
          sonarrItem: SONARR_ITEM,
          existingSeries: presentIn?.map((sonarr_instance_id) => ({
            ...SONARR_ITEM,
            sonarr_instance_id,
          })),
          primaryUser: null,
        },
        deps,
      ),
  },
  {
    contentType: 'movie',
    added: (deps: ContentRoutingDeps) =>
      vi.mocked(deps.radarrManager.routeItemToRadarr).mock.calls,
    route: (deps: ContentRoutingDeps, presentIn?: number[]) =>
      routeMovie(
        {
          tempItem: {
            title: 'Movie',
            key: 'movie-key',
            type: 'movie',
            guids: ['tmdb:456'],
          },
          userId: 1,
          userName: undefined,
          radarrItem: RADARR_ITEM,
          existingMovies: presentIn?.map((radarr_instance_id) => ({
            ...RADARR_ITEM,
            radarr_instance_id,
          })),
          primaryUser: null,
        },
        deps,
      ),
  },
]

describe.each(ROUTERS)('$contentType partial presence', ({ route, added }) => {
  const exists = { routed: false, skippedReason: 'exists-in-target' }

  it('replays only the record destination the API check did not find', async () => {
    const deps = buildDeps([FOUND, MISSING], recordNaming('approved', 1, 2))

    expect(await route(deps)).toEqual({ routed: true })
    expect(added(deps).map((call) => call[3])).toEqual([2])
    expect(added(deps)[0][5]).toMatchObject({ rootFolder: '/stored-2' })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('replays the record destination missing from the bulk data', async () => {
    const deps = buildDeps(
      [MISSING, MISSING],
      recordNaming('auto_approved', 1, 2),
    )

    expect(await route(deps, [1])).toEqual({ routed: true })
    expect(added(deps).map((call) => call[3])).toEqual([2])
  })

  it('skips when the record names no missing destination', async () => {
    const deps = buildDeps([FOUND, MISSING], recordNaming('approved', 1))

    expect(await route(deps)).toEqual(exists)
    expect(added(deps)).toEqual([])
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips when there is no record', async () => {
    const deps = buildDeps([FOUND, MISSING])

    expect(await route(deps)).toEqual(exists)
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips when the only record was rejected', async () => {
    const deps = buildDeps([FOUND, MISSING], recordNaming('rejected', 1, 2))

    expect(await route(deps)).toEqual(exists)
    expect(added(deps)).toEqual([])
  })

  it('skips without reading the record when the API check finds every target', async () => {
    const deps = buildDeps([FOUND, FOUND], recordNaming('approved', 1, 2, 3))

    expect(await route(deps)).toEqual(exists)
    expect(deps.db.getApprovalRequestByContent).not.toHaveBeenCalled()
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips when the bulk data holds every target', async () => {
    const deps = buildDeps([MISSING, MISSING])

    expect(await route(deps, [1, 2])).toEqual(exists)
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('routes through the content router when no target has it', async () => {
    const deps = buildDeps([MISSING, MISSING])

    await route(deps, [])

    expect(vi.mocked(deps.contentRouter.routeContent).mock.calls[0][2]).toEqual(
      {
        userId: 1,
        userName: undefined,
        syncing: false,
      },
    )
  })

  it('skips when one target lists it as an import list exclusion', async () => {
    const deps = buildDeps([{ ...FOUND, excluded: true }, MISSING])

    expect(await route(deps)).toEqual(exists)
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })
})
