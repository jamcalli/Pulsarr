import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import { WebhookCallbackError } from '@root/types/arr-connection.types.js'
import type { SonarrInstance, SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { SonarrService } from '@services/sonarr.service.js'
import { SonarrManagerService } from '@services/sonarr-manager.service.js'
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
import { createMockLogger } from '../../mocks/logger.js'

const INSTANCE: SonarrInstance = {
  id: 1,
  name: 'Test Sonarr',
  baseUrl: 'http://sonarr.test',
  apiKey: 'test-api-key',
  bypassIgnored: false,
  seasonMonitoring: 'all',
  monitorNewItems: 'all',
  tags: [],
  isDefault: true,
}

const ADDED = {
  seriesId: 7,
  rootFolder: '/sent',
  qualityProfileId: 6,
  tags: ['3'],
}

describe('SonarrManagerService.seriesExistsByTvdbId', () => {
  let getSonarrInstance: Mock<DatabaseService['getSonarrInstance']>
  let service: SonarrService
  let manager: SonarrManagerService

  beforeEach(() => {
    getSonarrInstance = vi.fn<DatabaseService['getSonarrInstance']>(
      async () => INSTANCE,
    )
    const db: Partial<DatabaseService> = { getSonarrInstance }
    const fastify: Partial<FastifyInstance> = { db: db as DatabaseService }
    service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as FastifyInstance,
    )
    manager = new SonarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['sonarrServices'].set(1, service)
  })

  function lookupReturns(found: boolean, checked = true) {
    vi.spyOn(service, 'seriesExistsByTvdbId').mockResolvedValue({
      found,
      checked,
      serviceName: 'Sonarr',
    })
  }

  it('returns a lookup hit without consulting exclusions', async () => {
    lookupReturns(true)
    const isExcluded = vi.spyOn(service, 'isTvdbIdExcluded')

    const result = await manager.seriesExistsByTvdbId(1, 123)

    expect(result.found).toBe(true)
    expect(getSonarrInstance).not.toHaveBeenCalled()
    expect(isExcluded).not.toHaveBeenCalled()
  })

  it('skips exclusions when the instance bypasses them', async () => {
    lookupReturns(false)
    getSonarrInstance.mockResolvedValue({ ...INSTANCE, bypassIgnored: true })
    const isExcluded = vi.spyOn(service, 'isTvdbIdExcluded')

    const result = await manager.seriesExistsByTvdbId(1, 123)

    expect(result.found).toBe(false)
    expect(isExcluded).not.toHaveBeenCalled()
  })

  it('reports an excluded miss as found', async () => {
    lookupReturns(false)
    vi.spyOn(service, 'isTvdbIdExcluded').mockResolvedValue(true)

    const result = await manager.seriesExistsByTvdbId(1, 123)

    expect(result).toMatchObject({
      found: true,
      checked: true,
      excluded: true,
      instanceId: 1,
    })
  })

  it('reports a miss that is not excluded as not found', async () => {
    lookupReturns(false)
    vi.spyOn(service, 'isTvdbIdExcluded').mockResolvedValue(false)

    const result = await manager.seriesExistsByTvdbId(1, 123)

    expect(result).toMatchObject({ found: false, checked: true })
  })

  it('reports a miss as unchecked when the exclusion lookup fails', async () => {
    lookupReturns(false)
    vi.spyOn(service, 'isTvdbIdExcluded').mockRejectedValue(
      new Error('Sonarr API error'),
    )

    const result = await manager.seriesExistsByTvdbId(1, 123)

    expect(result).toMatchObject({ found: false, checked: false })
  })

  it('passes an unchecked lookup through without an instance lookup', async () => {
    lookupReturns(false, false)

    const result = await manager.seriesExistsByTvdbId(1, 123)

    expect(result).toMatchObject({ found: false, checked: false })
    expect(getSonarrInstance).not.toHaveBeenCalled()
  })
})

describe('SonarrManagerService.routeItemToSonarr', () => {
  const item: SonarrItem = { title: 'Show', type: 'show', guids: ['tvdb:1'] }
  let service: SonarrService
  let manager: SonarrManagerService
  let addToSonarr: Mock<SonarrService['addToSonarr']>
  let db: Partial<DatabaseService>
  let emit: Mock<FastifyInstance['progress']['emit']>

  beforeEach(() => {
    emit = vi.fn()
    db = {
      getSonarrInstance: vi.fn<DatabaseService['getSonarrInstance']>(
        async () => ({
          ...INSTANCE,
          qualityProfile: 4,
          rootFolder: '/tv',
          tags: ['a'],
          searchOnAdd: false,
          seasonMonitoring: 'pilot',
          seriesType: 'anime',
        }),
      ),
      updateWatchlistItem: vi.fn<DatabaseService['updateWatchlistItem']>(
        async () => true,
      ),
    }
    const fastify: Partial<FastifyInstance> = {
      db: db as DatabaseService,
      progress: { emit } as unknown as FastifyInstance['progress'],
    }
    service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as FastifyInstance,
    )
    addToSonarr = vi.spyOn(service, 'addToSonarr').mockResolvedValue(ADDED)
    manager = new SonarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['sonarrServices'].set(1, service)
  })

  it('emits a watchlist status event for the routed user', async () => {
    await manager.routeItemToSonarr(item, 'key', 2, 1)

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'watchlist',
        metadata: { action: 'status', userIds: [2] },
      }),
    )
  })

  it('sends the instance values when the settings inherit', async () => {
    const applied = await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      rootFolder: null,
      qualityProfile: null,
      searchOnAdd: null,
      seasonMonitoring: null,
      seriesType: null,
    })

    expect(applied).toEqual({
      instanceId: 1,
      instanceType: 'sonarr',
      qualityProfile: 6,
      rootFolder: '/sent',
      tags: ['3'],
      searchOnAdd: false,
      seasonMonitoring: 'pilot',
      seriesType: 'anime',
    })
    expect(addToSonarr).toHaveBeenCalledWith(
      expect.anything(),
      '/tv',
      4,
      ['a'],
      false,
      'pilot',
      'anime',
    )
  })

  it('reports what the add service resolved for an instance with no folder, profile or tags', async () => {
    db.getSonarrInstance = vi.fn<DatabaseService['getSonarrInstance']>(
      async () => ({ ...INSTANCE, qualityProfile: null, rootFolder: null }),
    )

    const applied = await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      tags: [],
    })

    expect(addToSonarr).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      [],
      true,
      'all',
      'standard',
    )
    expect(applied).toMatchObject({
      qualityProfile: 6,
      rootFolder: '/sent',
      tags: ['3'],
    })
  })

  it('sends the settings it was given in place of the instance values', async () => {
    const applied = await manager.routeItemToSonarr(item, 'key', 2, 1, false, {
      rootFolder: '/rule',
      qualityProfile: '9',
      tags: [],
      searchOnAdd: true,
      seasonMonitoring: 'all',
      seriesType: 'daily',
    })

    expect(applied).toEqual({
      instanceId: 1,
      instanceType: 'sonarr',
      qualityProfile: 6,
      rootFolder: '/sent',
      tags: ['3'],
      searchOnAdd: true,
      seasonMonitoring: 'all',
      seriesType: 'daily',
    })
    expect(addToSonarr).toHaveBeenCalledWith(
      expect.anything(),
      '/rule',
      9,
      [],
      true,
      'all',
      'daily',
    )
  })

  it('refuses an instance that is not set up without calling it', async () => {
    db.getSonarrInstance = vi.fn<DatabaseService['getSonarrInstance']>(
      async () => ({ ...INSTANCE, apiKey: ARR_API_KEY_PLACEHOLDER }),
    )

    await expect(manager.routeItemToSonarr(item, 'key', 2, 1)).rejects.toThrow(
      'is not set up',
    )
    expect(addToSonarr).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })
})

describe('SonarrManagerService.resyncWebhooks', () => {
  let manager: SonarrManagerService
  let fastify: Partial<FastifyInstance>
  let initialize: Mock<SonarrService['initialize']>

  function seedOldService(appBaseUrl: string) {
    const oldService = new SonarrService(
      createMockLogger(),
      appBaseUrl,
      3003,
      fastify as FastifyInstance,
    )
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['sonarrServices'].set(1, oldService)
    return vi.spyOn(oldService, 'removeWebhook').mockResolvedValue()
  }

  beforeEach(() => {
    const db: Partial<DatabaseService> = {
      getAllSonarrInstances: vi.fn<DatabaseService['getAllSonarrInstances']>(
        async () => [INSTANCE],
      ),
    }
    fastify = {
      db: db as DatabaseService,
      config: {
        baseUrl: 'http://localhost',
        port: 3003,
      } as FastifyInstance['config'],
    }
    manager = new SonarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    initialize = vi
      .spyOn(SonarrService.prototype, 'initialize')
      .mockResolvedValue()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('removes the old hook only after the new one is stored', async () => {
    const removeWebhook = seedOldService('http://old-host')

    const results = await manager.resyncWebhooks()

    expect(results).toEqual([
      expect.objectContaining({ success: true, code: null }),
    ])
    expect(removeWebhook).toHaveBeenCalledOnce()
    expect(initialize.mock.invocationCallOrder[0]).toBeLessThan(
      removeWebhook.mock.invocationCallOrder[0],
    )
  })

  it('keeps the old hook and service when the new one is rejected', async () => {
    const removeWebhook = seedOldService('http://old-host')
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    const oldService = manager['sonarrServices'].get(1)
    initialize.mockRejectedValue(
      new WebhookCallbackError(
        'Failed to create webhook: Unable to send test message',
      ),
    )

    const results = await manager.resyncWebhooks()

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        code: 'callback_failed',
        message: 'Failed to create webhook: Unable to send test message',
      }),
    ])
    expect(removeWebhook).not.toHaveBeenCalled()
    expect(manager.getSonarrService(1)).toBe(oldService)
  })

  it('never removes the hook when the name is unchanged', async () => {
    const removeWebhook = seedOldService('http://localhost')

    const results = await manager.resyncWebhooks()

    expect(results).toEqual([expect.objectContaining({ success: true })])
    expect(removeWebhook).not.toHaveBeenCalled()
  })

  it('codes any other failure as unreachable', async () => {
    initialize.mockRejectedValue(new Error('fetch failed'))

    const results = await manager.resyncWebhooks()

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        code: 'unreachable',
        message: 'fetch failed',
      }),
    ])
  })
})

describe('SonarrManagerService.testWebhookAddress', () => {
  let manager: SonarrManagerService
  let fastify: Partial<FastifyInstance>
  let testWebhookCallback: Mock<SonarrService['testWebhookCallback']>

  beforeEach(() => {
    const db: Partial<DatabaseService> = {
      getAllSonarrInstances: vi.fn<DatabaseService['getAllSonarrInstances']>(
        async () => [
          INSTANCE,
          { ...INSTANCE, id: 2, name: 'Down' },
          { ...INSTANCE, id: 3, apiKey: ARR_API_KEY_PLACEHOLDER },
        ],
      ),
    }
    fastify = {
      db: db as DatabaseService,
      config: {
        baseUrl: 'http://localhost',
        port: 3003,
      } as FastifyInstance['config'],
    }
    manager = new SonarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    testWebhookCallback = vi
      .spyOn(SonarrService.prototype, 'testWebhookCallback')
      .mockResolvedValue()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tests every real instance and skips placeholders', async () => {
    const results = await manager.testWebhookAddress('http://new-host', 4004)

    expect(results).toEqual([
      expect.objectContaining({ instanceId: 1, success: true, code: null }),
      expect.objectContaining({ instanceId: 2, success: true, code: null }),
    ])
    expect(
      testWebhookCallback.mock.calls.map(([instance]) => instance.id),
    ).toEqual([1, 2])
  })

  it('codes a rejected callback apart from an unreachable arr', async () => {
    testWebhookCallback.mockImplementation(async (instance) => {
      throw instance.id === 1
        ? new WebhookCallbackError('Unable to send test message')
        : new Error('fetch failed')
    })

    const results = await manager.testWebhookAddress('http://new-host', 4004)

    expect(results).toEqual([
      expect.objectContaining({
        instanceId: 1,
        success: false,
        code: 'callback_failed',
        message: 'Unable to send test message',
      }),
      expect.objectContaining({
        instanceId: 2,
        success: false,
        code: 'unreachable',
        message: 'fetch failed',
      }),
    ])
  })

  it('leaves the service map untouched', async () => {
    const existing = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as FastifyInstance,
    )
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['sonarrServices'].set(1, existing)

    await manager.testWebhookAddress('http://new-host', 4004)

    expect(manager.getSonarrService(1)).toBe(existing)
    expect(manager.getSonarrService(2)).toBeUndefined()
  })
})
