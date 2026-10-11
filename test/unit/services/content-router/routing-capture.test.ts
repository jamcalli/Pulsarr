import type { ContentItem, RoutingDecision } from '@root/types/router.types.js'
import {
  routeToArr,
  settingsFromDecision,
} from '@services/content-router/routing-capture.js'
import { describe, expect, it, vi } from 'vitest'
import { appliedRadarr, appliedSonarr } from '../../../mocks/applied-routing.js'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const movie: ContentItem = { title: 'Movie', type: 'movie', guids: ['tmdb:1'] }
const show: ContentItem = { title: 'Show', type: 'show', guids: ['tvdb:1'] }

const target = (item: ContentItem) => ({
  item,
  key: 'key',
  userId: 3,
  instanceId: 2,
  syncing: false,
})

describe('routeToArr', () => {
  it('sends a movie to Radarr and reports what it applied', async () => {
    const routeItemToRadarr = vi
      .fn()
      .mockResolvedValue(appliedRadarr({ instanceId: 2, qualityProfile: 6 }))
    const routeItemToSonarr = vi.fn()
    const deps = createContentRouterDeps({
      radarrManager: { routeItemToRadarr },
      sonarrManager: { routeItemToSonarr },
    })

    const details = await routeToArr(target(movie), { rootFolder: null }, deps)

    expect(routeItemToRadarr).toHaveBeenCalledWith(movie, 'key', 3, 2, false, {
      rootFolder: null,
    })
    expect(routeItemToSonarr).not.toHaveBeenCalled()
    expect(details).toEqual({
      instanceId: 2,
      instanceType: 'radarr',
      qualityProfile: '6',
      rootFolder: '/movies',
      tags: [],
      searchOnAdd: true,
      minimumAvailability: 'released',
      monitor: 'movieOnly',
    })
  })

  it('sends a show to Sonarr and reports what it applied', async () => {
    const routeItemToSonarr = vi
      .fn()
      .mockResolvedValue(appliedSonarr({ instanceId: 2, seriesType: 'anime' }))
    const deps = createContentRouterDeps({
      sonarrManager: { routeItemToSonarr },
    })

    const details = await routeToArr(target(show), {}, deps)

    expect(details).toEqual(
      expect.objectContaining({
        instanceId: 2,
        instanceType: 'sonarr',
        qualityProfile: '1',
        seriesType: 'anime',
      }),
    )
  })

  it('reports no quality profile when none applied', async () => {
    const deps = createContentRouterDeps({
      radarrManager: {
        routeItemToRadarr: vi
          .fn()
          .mockResolvedValue(appliedRadarr({ qualityProfile: undefined })),
      },
    })

    const details = await routeToArr(target(movie), {}, deps)

    expect(details.qualityProfile).toBeUndefined()
  })

  it('rethrows a failed add', async () => {
    const deps = createContentRouterDeps({
      radarrManager: {
        routeItemToRadarr: vi.fn().mockRejectedValue(new Error('down')),
      },
    })

    await expect(routeToArr(target(movie), {}, deps)).rejects.toThrow('down')
  })
})

describe('settingsFromDecision', () => {
  it('passes the rule values through, nulls included', () => {
    const decision: RoutingDecision = {
      instanceId: 1,
      qualityProfile: null,
      rootFolder: null,
      tags: ['a'],
      priority: 70,
      searchOnAdd: null,
      monitor: 'none',
      ruleId: 4,
      ruleName: 'Rule',
    }

    expect(settingsFromDecision(decision)).toEqual({
      qualityProfile: null,
      rootFolder: null,
      tags: ['a'],
      searchOnAdd: null,
      minimumAvailability: undefined,
      monitor: 'none',
      seasonMonitoring: undefined,
      seriesType: undefined,
    })
  })
})
