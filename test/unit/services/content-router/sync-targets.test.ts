import type { ContentItem, RoutingDecision } from '@root/types/router.types.js'
import {
  routeSyncTarget,
  type SyncTargetParams,
} from '@services/content-router/sync-targets.js'
import { describe, expect, it, vi } from 'vitest'
import { echoAppliedSonarr } from '../../../mocks/applied-routing.js'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const showItem: ContentItem = {
  title: 'Test Show',
  type: 'show',
  guids: ['tvdb:1'],
}

const decision = (instanceId: number): RoutingDecision => ({
  instanceId,
  qualityProfile: '4',
  rootFolder: null,
  tags: ['t'],
  priority: 50,
  searchOnAdd: true,
  seasonMonitoring: 'pilot',
  seriesType: 'anime',
})

const params = (overrides: Partial<SyncTargetParams>): SyncTargetParams => ({
  item: showItem,
  key: 'key',
  userId: 3,
  syncTargetInstanceId: 2,
  decisions: [],
  hasRulesTargetingSyncInstance: false,
  ...overrides,
})

describe('routeSyncTarget', () => {
  it('routes with the matching decision settings', async () => {
    const routeItemToSonarr = vi.fn(echoAppliedSonarr())
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeSyncTarget(
      params({ decisions: [decision(1), decision(2)] }),
      deps,
    )

    expect(result).toEqual({ routedInstances: [2], routingDetails: [] })
    expect(routeItemToSonarr).toHaveBeenCalledWith(
      showItem,
      'key',
      3,
      2,
      true,
      {
        rootFolder: null,
        qualityProfile: '4',
        tags: ['t'],
        searchOnAdd: true,
        minimumAvailability: undefined,
        monitor: undefined,
        seasonMonitoring: 'pilot',
        seriesType: 'anime',
      },
    )
  })

  it('blocks the sync when rules route elsewhere', async () => {
    const routeItemToSonarr = vi.fn()
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeSyncTarget(
      params({ decisions: [decision(1)] }),
      deps,
    )

    expect(result).toEqual({ routedInstances: [], routingDetails: [] })
    expect(routeItemToSonarr).not.toHaveBeenCalled()
  })

  it('blocks the sync when rules govern the target and none matched', async () => {
    const routeItemToSonarr = vi.fn()
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeSyncTarget(
      params({ hasRulesTargetingSyncInstance: true }),
      deps,
    )

    expect(result).toEqual({ routedInstances: [], routingDetails: [] })
    expect(routeItemToSonarr).not.toHaveBeenCalled()
  })

  it('routes an ungoverned target with instance defaults', async () => {
    const routeItemToSonarr = vi.fn(echoAppliedSonarr())
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const result = await routeSyncTarget(params({}), deps)

    expect(result).toEqual({ routedInstances: [2], routingDetails: [] })
    expect(routeItemToSonarr).toHaveBeenCalledWith(
      showItem,
      'key',
      3,
      2,
      true,
      {},
    )
  })

  it('rethrows an add failure', async () => {
    const deps = createContentRouterDeps({
      sonarrManager: {
        routeItemToSonarr: vi.fn().mockRejectedValue(new Error('down')),
      },
    })

    await expect(routeSyncTarget(params({}), deps)).rejects.toThrow('down')
  })
})
