import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  routeMovie,
  routeShow,
} from '@services/watchlist-workflow/routing/content-router.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
import { describe, expect, it, vi } from 'vitest'
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

function buildDeps(...byInstance: ExistenceCheckResult[]): ContentRoutingDeps {
  const instanceIds = byInstance.map((_, index) => index + 1)
  const existence = async (instanceId: number) => byInstance[instanceId - 1]
  return createWorkflowDeps({
    contentRouter: {
      getTargetInstances: vi.fn(async () => ({ instanceIds })),
      routeContent: vi.fn(async () => ({
        routedInstances: [1],
        routingDetails: [],
      })),
    },
    sonarrManager: {
      seriesExistsByTvdbId: vi.fn(existence),
    },
    radarrManager: {
      movieExistsByTmdbId: vi.fn(existence),
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
    deps = buildDeps({
      found: true,
      checked: true,
      excluded: true,
      serviceName: 'Sonarr',
    })

    const result = await route()

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('routes a show that is not found', async () => {
    deps = buildDeps({ found: false, checked: true, serviceName: 'Sonarr' })

    const result = await route()

    expect(result).toEqual({ routed: true })
    expect(deps.contentRouter.routeContent).toHaveBeenCalledTimes(1)
  })

  it('skips a show when one of several targets could not be checked', async () => {
    deps = buildDeps(
      { found: false, checked: false, serviceName: 'Sonarr' },
      { found: false, checked: true, serviceName: 'Sonarr' },
    )

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips a show when no instance could be checked', async () => {
    deps = buildDeps({ found: false, checked: false, serviceName: 'Sonarr' })

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
    deps = buildDeps({
      found: true,
      checked: true,
      excluded: true,
      serviceName: 'Radarr',
    })

    const result = await route()

    expect(result).toEqual({ routed: false, skippedReason: 'exists-in-target' })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('routes a movie that is not found', async () => {
    deps = buildDeps({ found: false, checked: true, serviceName: 'Radarr' })

    const result = await route()

    expect(result).toEqual({ routed: true })
    expect(deps.contentRouter.routeContent).toHaveBeenCalledTimes(1)
  })

  it('skips a movie when one of several targets could not be checked', async () => {
    deps = buildDeps(
      { found: false, checked: false, serviceName: 'Radarr' },
      { found: false, checked: true, serviceName: 'Radarr' },
    )

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })

  it('skips a movie when no instance could be checked', async () => {
    deps = buildDeps({ found: false, checked: false, serviceName: 'Radarr' })

    const result = await route()

    expect(result).toEqual({
      routed: false,
      skippedReason: 'no-instances-available',
    })
    expect(deps.contentRouter.routeContent).not.toHaveBeenCalled()
  })
})
