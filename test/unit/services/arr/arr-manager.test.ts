import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type { RadarrInstance } from '@root/types/radarr.types.js'
import type { SonarrInstance, SonarrItem } from '@root/types/sonarr.types.js'
import { WEBHOOK_RESYNC_CONCURRENCY } from '@services/arr/arr-manager.js'
import { ArrService } from '@services/arr/arr-service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { PlexSessionMonitorService } from '@services/plex-session-monitor.service.js'
import { RadarrService } from '@services/radarr.service.js'
import { RadarrManagerService } from '@services/radarr-manager.service.js'
import { SonarrService } from '@services/sonarr.service.js'
import { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { InvalidSeasonMonitoringError } from '@utils/season-monitoring.js'
import type { FastifyInstance } from 'fastify'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

const SONARR_ROW: SonarrInstance = {
  id: 1,
  name: 'Main',
  baseUrl: 'http://arr.test',
  apiKey: 'key',
  bypassIgnored: false,
  seasonMonitoring: 'all',
  monitorNewItems: 'all',
  tags: [],
  isDefault: true,
}

const RADARR_ROW: RadarrInstance = {
  id: 1,
  name: 'Main',
  baseUrl: 'http://arr.test',
  apiKey: 'key',
  bypassIgnored: false,
  tags: [],
  isDefault: true,
}

const realInitialize = ArrService.prototype.initialize

interface RowOverrides {
  id: number
  name?: string
  apiKey?: string
}

interface Store {
  create: Mock<(instance: object) => Promise<number>>
  delete: Mock<(id: number) => Promise<void>>
  update: Mock<(id: number, updates: object) => Promise<void>>
}

interface Harness {
  seed(...rows: RowOverrides[]): void
  add(): Promise<number>
  fetchAll(): Promise<object[]>
  spyFetch(): Mock<(bypass?: boolean) => Promise<Set<object>>>
  manager: SonarrManagerService | RadarrManagerService
  services(): Map<
    number,
    ArrService<SonarrInstance> | ArrService<RadarrInstance>
  >
}

function fastifyWith(db: Partial<DatabaseService>) {
  const clearRouterRulesCache = vi.fn()
  const fastify: Partial<FastifyInstance> = {
    db: db as DatabaseService,
    config: {
      baseUrl: 'http://localhost',
      port: 3003,
    } as FastifyInstance['config'],
    contentRouter: {
      clearRouterRulesCache,
    } as unknown as FastifyInstance['contentRouter'],
  }
  return { fastify: fastify as FastifyInstance, clearRouterRulesCache }
}

function sonarrHarness(store: Store) {
  let rows: SonarrInstance[] = []
  const { fastify, clearRouterRulesCache } = fastifyWith({
    getAllSonarrInstances: async () => rows,
    getSonarrInstance: async (id) => rows.find((row) => row.id === id) ?? null,
    createSonarrInstance: store.create,
    deleteSonarrInstance: store.delete,
    updateSonarrInstance: store.update,
  })
  const manager = new SonarrManagerService(createMockLogger(), fastify)
  const harness: Harness = {
    manager,
    seed: (...overrides) => {
      rows = overrides.map((o) => ({ ...SONARR_ROW, ...o }))
    },
    add: () => manager.addInstance({ ...SONARR_ROW, name: 'New' }),
    fetchAll: () => manager.fetchAllSeries(),
    spyFetch: () =>
      vi
        .spyOn(SonarrService.prototype, 'fetchSeries')
        .mockResolvedValue(
          new Set([{ title: 'Show', type: 'show', guids: [] }]),
        ),
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    services: () => manager['services'],
  }
  return { harness, clearRouterRulesCache }
}

function radarrHarness(store: Store) {
  let rows: RadarrInstance[] = []
  const { fastify, clearRouterRulesCache } = fastifyWith({
    getAllRadarrInstances: async () => rows,
    getRadarrInstance: async (id) => rows.find((row) => row.id === id) ?? null,
    createRadarrInstance: store.create,
    deleteRadarrInstance: store.delete,
    updateRadarrInstance: store.update,
  })
  const manager = new RadarrManagerService(createMockLogger(), fastify)
  const harness: Harness = {
    manager,
    seed: (...overrides) => {
      rows = overrides.map((o) => ({ ...RADARR_ROW, ...o }))
    },
    add: () => manager.addInstance({ ...RADARR_ROW, name: 'New' }),
    fetchAll: () => manager.fetchAllMovies(),
    spyFetch: () =>
      vi
        .spyOn(RadarrService.prototype, 'fetchMovies')
        .mockResolvedValue(
          new Set([{ title: 'Movie', type: 'movie', guids: [] }]),
        ),
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    services: () => manager['services'],
  }
  return { harness, clearRouterRulesCache }
}

describe.each([
  { appName: 'Sonarr', build: sonarrHarness },
  { appName: 'Radarr', build: radarrHarness },
])('$appName manager', ({ appName, build }) => {
  let store: Store
  let harness: Harness
  let clearRouterRulesCache: Mock
  let initialize: Mock<ArrService<SonarrInstance>['initialize']>
  let removeWebhook: Mock<ArrService<SonarrInstance>['removeWebhook']>

  beforeEach(() => {
    store = {
      create: vi.fn(async () => 7),
      delete: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
    }
    ;({ harness, clearRouterRulesCache } = build(store))
    initialize = vi
      .spyOn(ArrService.prototype, 'initialize')
      .mockResolvedValue()
    removeWebhook = vi
      .spyOn(ArrService.prototype, 'removeWebhook')
      .mockResolvedValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initialize', () => {
    it('retries an instance once after a backoff', async () => {
      vi.useFakeTimers()
      harness.seed({ id: 1 })
      initialize.mockRejectedValueOnce(new Error('down'))

      const done = harness.manager.initialize()
      await vi.advanceTimersByTimeAsync(2500)
      await done

      expect(initialize).toHaveBeenCalledTimes(2)
      expect(harness.services().has(1)).toBe(true)
    })

    it('keeps the instances that came up when another fails twice', async () => {
      vi.useFakeTimers()
      harness.seed({ id: 1 }, { id: 2 })
      initialize.mockImplementation(async (instance) => {
        if (instance.id === 1) throw new Error('down')
      })

      const done = harness.manager.initialize()
      await vi.advanceTimersByTimeAsync(2500)
      await done

      expect(initialize).toHaveBeenCalledTimes(3)
      expect([...harness.services().keys()]).toEqual([2])
    })

    it('throws when no instance comes up', async () => {
      vi.useFakeTimers()
      harness.seed({ id: 1 })
      initialize.mockRejectedValue(new Error('down'))

      const done = harness.manager.initialize()
      const failed = expect(done).rejects.toThrow(
        `Unable to initialize any ${appName} services`,
      )
      await vi.advanceTimersByTimeAsync(2500)
      await failed
    })
  })

  describe('addInstance', () => {
    it('keeps the service for a created instance', async () => {
      await expect(harness.add()).resolves.toBe(7)

      expect(harness.services().has(7)).toBe(true)
      expect(store.delete).not.toHaveBeenCalled()
    })

    it('removes the webhook and the row when the instance fails to start', async () => {
      initialize.mockRejectedValue(new Error('unreachable'))

      await expect(harness.add()).rejects.toThrow('unreachable')

      expect(removeWebhook).toHaveBeenCalledOnce()
      expect(store.delete).toHaveBeenCalledWith(7)
      expect(harness.services().has(7)).toBe(false)
    })

    it('still deletes the row when the webhook cleanup fails', async () => {
      initialize.mockRejectedValue(new Error('unreachable'))
      removeWebhook.mockRejectedValue(new Error('gone'))

      await expect(harness.add()).rejects.toThrow('unreachable')

      expect(store.delete).toHaveBeenCalledWith(7)
    })
  })

  describe('removeInstance', () => {
    it('removes the webhook before deleting the row and its service', async () => {
      await harness.add()

      await harness.manager.removeInstance(7)

      expect(removeWebhook.mock.invocationCallOrder[0]).toBeLessThan(
        store.delete.mock.invocationCallOrder[0],
      )
      expect(store.delete).toHaveBeenCalledWith(7)
      expect(harness.services().has(7)).toBe(false)
      expect(clearRouterRulesCache).toHaveBeenCalledOnce()
    })

    it('deletes the row when the webhook removal fails', async () => {
      await harness.add()
      removeWebhook.mockRejectedValue(new Error('gone'))

      await harness.manager.removeInstance(7)

      expect(store.delete).toHaveBeenCalledWith(7)
    })

    it('deletes a row that has no service', async () => {
      await harness.manager.removeInstance(9)

      expect(removeWebhook).not.toHaveBeenCalled()
      expect(store.delete).toHaveBeenCalledWith(9)
    })
  })

  describe('updateInstance', () => {
    it('keeps the live webhook when saving a new API key on the same server fails', async () => {
      harness.seed({ id: 1 })
      store.update.mockRejectedValue(new Error('db down'))

      await expect(
        harness.manager.updateInstance(1, { apiKey: 'rotated' }),
      ).rejects.toThrow(`Failed to persist ${appName} instance update`)
      expect(removeWebhook).not.toHaveBeenCalled()
    })

    it('points the live webhook back at the saved path when a path-only change fails to save', async () => {
      harness.seed({ id: 1 })
      store.update.mockRejectedValue(new Error('db down'))

      await expect(
        harness.manager.updateInstance(1, { baseUrl: 'http://arr.test/arr2' }),
      ).rejects.toThrow(`Failed to persist ${appName} instance update`)
      expect(removeWebhook).not.toHaveBeenCalled()
      expect(initialize.mock.calls.map(([row]) => row.baseUrl)).toEqual([
        'http://arr.test/arr2',
        'http://arr.test',
      ])
    })

    it('removes the new webhook when saving a move to another server fails', async () => {
      harness.seed({ id: 1 })
      store.update.mockRejectedValue(new Error('db down'))

      await expect(
        harness.manager.updateInstance(1, { baseUrl: 'http://other.test' }),
      ).rejects.toThrow(`Failed to persist ${appName} instance update`)
      expect(removeWebhook).toHaveBeenCalledOnce()
    })
  })

  describe('resyncWebhooks', () => {
    it(`runs at most ${WEBHOOK_RESYNC_CONCURRENCY} instances at once`, async () => {
      harness.seed(...[1, 2, 3, 4, 5, 6].map((id) => ({ id })))
      let active = 0
      let peak = 0
      initialize.mockImplementation(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
      })

      const results = await harness.manager.resyncWebhooks()

      expect(results).toHaveLength(6)
      expect(peak).toBe(WEBHOOK_RESYNC_CONCURRENCY)
    })

    it('stores the new hook before removing a renamed old one', async () => {
      harness.seed({ id: 1 })
      await harness.add()
      const old = harness.services().get(7)
      if (old) harness.services().set(1, old)
      vi.spyOn(ArrService.prototype, 'getWebhookName')
        .mockReturnValueOnce('new')
        .mockReturnValue('old')

      await harness.manager.resyncWebhooks()

      expect(removeWebhook).toHaveBeenCalledOnce()
      expect(initialize.mock.invocationCallOrder.at(-1)).toBeLessThan(
        removeWebhook.mock.invocationCallOrder[0],
      )
    })

    it('skips placeholder instances', async () => {
      harness.seed({ id: 1 }, { id: 2, apiKey: ARR_API_KEY_PLACEHOLDER })

      const results = await harness.manager.resyncWebhooks()

      expect(results.map((result) => result.instanceId)).toEqual([1])
    })
  })

  describe('placeholder instances', () => {
    it('leaves a placeholder out of the health check', async () => {
      initialize.mockImplementation(async function (
        this: ArrService<SonarrInstance>,
        instance,
      ) {
        if (instance.apiKey === ARR_API_KEY_PLACEHOLDER) {
          await realInitialize.call(this, instance)
        }
      })
      const isHealthy = vi
        .spyOn(ArrService.prototype, 'isHealthy')
        .mockResolvedValue({ healthy: false, error: 'down' })
      harness.seed({ id: 1 }, { id: 2, apiKey: ARR_API_KEY_PLACEHOLDER })
      await harness.manager.initialize()

      const health = await harness.manager.checkInstancesHealth()

      expect(health).toEqual({ available: [], unavailable: [1] })
      expect(isHealthy).toHaveBeenCalledOnce()
    })

    it('fetches no library from a placeholder', async () => {
      harness.seed({ id: 1 }, { id: 2, apiKey: ARR_API_KEY_PLACEHOLDER })
      await harness.manager.initialize()
      const fetch = harness.spyFetch()

      const items = await harness.fetchAll()

      expect(items).toHaveLength(1)
      expect(fetch).toHaveBeenCalledOnce()
    })
  })
})

describe('Sonarr post-add step', () => {
  const item: SonarrItem = {
    title: 'Show',
    type: 'show',
    guids: ['tvdb:81189'],
  }
  let manager: SonarrManagerService
  let addToSonarr: Mock<SonarrService['addToSonarr']>
  let createRollingMonitoredShow: Mock<
    PlexSessionMonitorService['createRollingMonitoredShow']
  >
  let monitorAllSeasonPilots: Mock<
    PlexSessionMonitorService['monitorAllSeasonPilots']
  >
  let createSonarrInstance: Mock<DatabaseService['createSonarrInstance']>

  beforeEach(() => {
    createRollingMonitoredShow = vi.fn(async () => 1)
    monitorAllSeasonPilots = vi.fn(async () => {})
    createSonarrInstance = vi.fn(async () => 7)
    const db: Partial<DatabaseService> = {
      getSonarrInstance: async () => SONARR_ROW,
      createSonarrInstance,
      updateWatchlistItem: async () => true,
    }
    const fastify: Partial<FastifyInstance> = {
      db: db as DatabaseService,
      progress: { emit: vi.fn() } as unknown as FastifyInstance['progress'],
      plexSessionMonitor: {
        createRollingMonitoredShow,
        monitorAllSeasonPilots,
      } as unknown as PlexSessionMonitorService,
    }
    manager = new SonarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    const service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as FastifyInstance,
    )
    addToSonarr = vi.spyOn(service, 'addToSonarr').mockResolvedValue({
      seriesId: 42,
      rootFolder: '/tv',
      qualityProfileId: 1,
      tags: [],
    })
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['services'].set(1, service)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['pilotRolling', 'pilot'],
    ['firstSeasonRolling', 'firstSeason'],
    ['allSeasonPilotRolling', 'none'],
  ])('adds %s as %s and enrolls the show', async (rolling, monitor) => {
    const applied = await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      seasonMonitoring: rolling,
    })

    expect(addToSonarr.mock.calls[0][5]).toBe(monitor)
    expect(createRollingMonitoredShow).toHaveBeenCalledWith(
      42,
      1,
      '81189',
      'Show',
      rolling,
    )
    expect(applied.seasonMonitoring).toBe(rolling)
  })

  it('seeds every season pilot only for all season pilot rolling', async () => {
    await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      seasonMonitoring: 'pilotRolling',
    })
    expect(monitorAllSeasonPilots).not.toHaveBeenCalled()

    await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      seasonMonitoring: 'allSeasonPilotRolling',
    })
    expect(monitorAllSeasonPilots).toHaveBeenCalledWith(42, 1)
  })

  it('never enrolls a show added with a plain option', async () => {
    await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      seasonMonitoring: 'firstSeason',
    })

    expect(addToSonarr.mock.calls[0][5]).toBe('firstSeason')
    expect(createRollingMonitoredShow).not.toHaveBeenCalled()
  })

  it('keeps the add when enrollment fails', async () => {
    createRollingMonitoredShow.mockRejectedValue(new Error('db down'))

    await expect(
      manager.routeItemToSonarr(item, 'key', 2, 1, false, {
        seasonMonitoring: 'pilotRolling',
      }),
    ).resolves.toMatchObject({
      instanceId: 1,
      seasonMonitoring: 'pilotRolling',
    })
  })

  it('refuses an unknown season monitoring value before creating the row', async () => {
    await expect(
      manager.addInstance({ ...SONARR_ROW, seasonMonitoring: 'sometimes' }),
    ).rejects.toThrow(InvalidSeasonMonitoringError)
    expect(createSonarrInstance).not.toHaveBeenCalled()
  })
})
