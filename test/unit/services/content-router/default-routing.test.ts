import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { ContentItem } from '@root/types/router.types.js'
import {
  getDefaultInstanceIds,
  getDefaultRoutingDecisions,
  routeUsingDefault,
} from '@services/content-router/default-routing.js'
import { describe, expect, it, vi } from 'vitest'
import { echoAppliedRadarr } from '../../../mocks/applied-routing.js'
import { createContentRouterDeps } from '../../../mocks/content-router-deps.js'

const movieItem: ContentItem = {
  title: 'Test Movie',
  type: 'movie',
  guids: ['tmdb:1'],
}

const radarrInstance = (id: number, overrides = {}) => ({
  id,
  name: `Radarr ${id}`,
  qualityProfile: '7',
  rootFolder: '/movies',
  tags: ['a'],
  searchOnAdd: false,
  minimumAvailability: 'announced',
  monitor: 'none',
  ...overrides,
})

describe('getDefaultInstanceIds', () => {
  it('returns nothing when there is no default instance', async () => {
    const deps = createContentRouterDeps({
      db: { getDefaultRadarrInstance: vi.fn().mockResolvedValue(null) },
    })

    expect(await getDefaultInstanceIds('movie', deps)).toEqual({
      instanceIds: [],
    })
  })

  it('skips a default instance that is not set up', async () => {
    const getAllRadarrInstances = vi.fn()
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi.fn().mockResolvedValue({
          id: 1,
          name: 'Main',
          apiKey: ARR_API_KEY_PLACEHOLDER,
          syncedInstances: [2],
        }),
        getAllRadarrInstances,
      },
    })

    expect(await getDefaultInstanceIds('movie', deps)).toEqual({
      instanceIds: [],
    })
    expect(getAllRadarrInstances).not.toHaveBeenCalled()
  })

  it('reports the skip flag on the default instance', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultSonarrInstance: vi.fn().mockResolvedValue({
          id: 1,
          name: 'Main',
          skipDefaultRoutingWhenNoMatch: true,
        }),
      },
    })

    expect(await getDefaultInstanceIds('show', deps)).toEqual({
      instanceIds: [],
      skipReason: 'default-skip',
    })
  })

  it('appends known synced instances once and skips unknown ids', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi.fn().mockResolvedValue({
          id: 1,
          name: 'Main',
          syncedInstances: [1, 2, 9],
        }),
        getAllRadarrInstances: vi
          .fn()
          .mockResolvedValue([radarrInstance(1), radarrInstance(2)]),
      },
    })

    expect(await getDefaultInstanceIds('movie', deps)).toEqual({
      instanceIds: [1, 2],
    })
  })

  it('routes to the default only when the synced list is bad JSON', async () => {
    const getAllRadarrInstances = vi.fn()
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi
          .fn()
          .mockResolvedValue({ id: 1, name: 'Main', syncedInstances: '[1,' }),
        getAllRadarrInstances,
      },
    })

    expect(await getDefaultInstanceIds('movie', deps)).toEqual({
      instanceIds: [1],
    })
    expect(getAllRadarrInstances).not.toHaveBeenCalled()
  })

  it('propagates a failed default instance read', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi.fn().mockRejectedValue(new Error('db')),
      },
    })

    await expect(getDefaultInstanceIds('movie', deps)).rejects.toThrow('db')
  })
})

describe('getDefaultRoutingDecisions', () => {
  it('resolves each default movie instance into a decision', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi
          .fn()
          .mockResolvedValue({ id: 1, name: 'Main', syncedInstances: [2] }),
        getAllRadarrInstances: vi.fn().mockResolvedValue([
          radarrInstance(1),
          radarrInstance(2, {
            qualityProfile: null,
            rootFolder: null,
            tags: undefined,
            searchOnAdd: undefined,
            minimumAvailability: undefined,
            monitor: undefined,
          }),
        ]),
      },
    })

    expect(await getDefaultRoutingDecisions('movie', deps)).toEqual([
      {
        instanceId: 1,
        qualityProfile: '7',
        rootFolder: '/movies',
        tags: ['a'],
        priority: 50,
        searchOnAdd: false,
        minimumAvailability: 'announced',
        monitor: 'none',
      },
      {
        instanceId: 2,
        qualityProfile: null,
        rootFolder: null,
        tags: [],
        priority: 50,
        searchOnAdd: true,
        minimumAvailability: 'released',
        monitor: 'movieOnly',
      },
    ])
  })

  it('resolves each default show instance into a decision', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultSonarrInstance: vi
          .fn()
          .mockResolvedValue({ id: 1, name: 'Main', syncedInstances: [2] }),
        getAllSonarrInstances: vi.fn().mockResolvedValue([
          {
            id: 1,
            name: 'Sonarr 1',
            qualityProfile: 3,
            rootFolder: '/tv',
            tags: ['b'],
            searchOnAdd: false,
            seasonMonitoring: 'pilot',
            seriesType: 'anime',
          },
          { id: 2, name: 'Sonarr 2', tags: [] },
        ]),
      },
    })

    expect(await getDefaultRoutingDecisions('show', deps)).toEqual([
      {
        instanceId: 1,
        qualityProfile: '3',
        rootFolder: '/tv',
        tags: ['b'],
        priority: 50,
        searchOnAdd: false,
        seasonMonitoring: 'pilot',
        seriesType: 'anime',
      },
      {
        instanceId: 2,
        qualityProfile: null,
        rootFolder: null,
        tags: [],
        priority: 50,
        searchOnAdd: true,
        seasonMonitoring: 'all',
        seriesType: 'standard',
      },
    ])
  })

  it('propagates a failed instance list read', async () => {
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi
          .fn()
          .mockResolvedValue({ id: 1, name: 'Main' }),
        getAllRadarrInstances: vi.fn().mockRejectedValue(new Error('db')),
      },
    })

    await expect(getDefaultRoutingDecisions('movie', deps)).rejects.toThrow(
      'db',
    )
  })
})

describe('routeUsingDefault', () => {
  it('returns what each instance applied and keeps routing after one fails', async () => {
    const routeItemToRadarr = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementation(echoAppliedRadarr({ rootFolder: '/applied' }))
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi
          .fn()
          .mockResolvedValue({ id: 1, name: 'Main', syncedInstances: [2, 3] }),
        getAllRadarrInstances: vi
          .fn()
          .mockResolvedValue([
            radarrInstance(1),
            radarrInstance(2),
            radarrInstance(3),
          ]),
      },
      radarrManager: { routeItemToRadarr },
    })

    const routings = await routeUsingDefault(movieItem, 'key', 3, false, deps)

    expect(routings).toEqual([
      expect.objectContaining({
        instanceId: 2,
        qualityProfile: '1',
        rootFolder: '/applied',
      }),
      expect.objectContaining({ instanceId: 3 }),
    ])
    expect(routeItemToRadarr).toHaveBeenCalledTimes(3)
    expect(routeItemToRadarr).toHaveBeenNthCalledWith(
      2,
      movieItem,
      'key',
      3,
      2,
      false,
      {},
    )
  })

  it('propagates a failed default instance read', async () => {
    const routeItemToRadarr = vi.fn()
    const deps = createContentRouterDeps({
      db: {
        getDefaultRadarrInstance: vi.fn().mockRejectedValue(new Error('db')),
      },
      radarrManager: { routeItemToRadarr },
    })

    await expect(
      routeUsingDefault(movieItem, 'key', 3, false, deps),
    ).rejects.toThrow('db')
    expect(routeItemToRadarr).not.toHaveBeenCalled()
  })
})
