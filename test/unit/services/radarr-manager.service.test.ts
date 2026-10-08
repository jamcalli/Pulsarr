import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type {
  RadarrInstance,
  Item as RadarrItem,
} from '@root/types/radarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { RadarrService } from '@services/radarr.service.js'
import { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

const INSTANCE: RadarrInstance = {
  id: 1,
  name: 'Test Radarr',
  baseUrl: 'http://radarr.test',
  apiKey: 'test-api-key',
  bypassIgnored: false,
  tags: [],
  isDefault: true,
}

const ADDED = {
  rootFolder: '/sent',
  qualityProfileId: 6,
  tags: ['3'],
}

describe('RadarrManagerService.movieExistsByTmdbId', () => {
  let getRadarrInstance: Mock<DatabaseService['getRadarrInstance']>
  let service: RadarrService
  let manager: RadarrManagerService

  beforeEach(() => {
    getRadarrInstance = vi.fn<DatabaseService['getRadarrInstance']>(
      async () => INSTANCE,
    )
    const db: Partial<DatabaseService> = { getRadarrInstance }
    const fastify: Partial<FastifyInstance> = { db: db as DatabaseService }
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as FastifyInstance,
    )
    manager = new RadarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['radarrServices'].set(1, service)
  })

  function lookupReturns(found: boolean, checked = true) {
    vi.spyOn(service, 'movieExistsByTmdbId').mockResolvedValue({
      found,
      checked,
      serviceName: 'Radarr',
    })
  }

  it('returns a lookup hit without consulting exclusions', async () => {
    lookupReturns(true)
    const isExcluded = vi.spyOn(service, 'isTmdbIdExcluded')

    const result = await manager.movieExistsByTmdbId(1, 123)

    expect(result.found).toBe(true)
    expect(getRadarrInstance).not.toHaveBeenCalled()
    expect(isExcluded).not.toHaveBeenCalled()
  })

  it('skips exclusions when the instance bypasses them', async () => {
    lookupReturns(false)
    getRadarrInstance.mockResolvedValue({ ...INSTANCE, bypassIgnored: true })
    const isExcluded = vi.spyOn(service, 'isTmdbIdExcluded')

    const result = await manager.movieExistsByTmdbId(1, 123)

    expect(result.found).toBe(false)
    expect(isExcluded).not.toHaveBeenCalled()
  })

  it('reports an excluded miss as found', async () => {
    lookupReturns(false)
    vi.spyOn(service, 'isTmdbIdExcluded').mockResolvedValue(true)

    const result = await manager.movieExistsByTmdbId(1, 123)

    expect(result).toMatchObject({
      found: true,
      checked: true,
      excluded: true,
      instanceId: 1,
    })
  })

  it('reports a miss that is not excluded as not found', async () => {
    lookupReturns(false)
    vi.spyOn(service, 'isTmdbIdExcluded').mockResolvedValue(false)

    const result = await manager.movieExistsByTmdbId(1, 123)

    expect(result).toMatchObject({ found: false, checked: true })
  })

  it('reports a miss as unchecked when the exclusion lookup fails', async () => {
    lookupReturns(false)
    vi.spyOn(service, 'isTmdbIdExcluded').mockRejectedValue(
      new Error('Radarr API error'),
    )

    const result = await manager.movieExistsByTmdbId(1, 123)

    expect(result).toMatchObject({ found: false, checked: false })
  })

  it('passes an unchecked lookup through without an instance lookup', async () => {
    lookupReturns(false, false)

    const result = await manager.movieExistsByTmdbId(1, 123)

    expect(result).toMatchObject({ found: false, checked: false })
    expect(getRadarrInstance).not.toHaveBeenCalled()
  })
})

describe('RadarrManagerService.routeItemToRadarr', () => {
  const item: RadarrItem = { title: 'Movie', type: 'movie', guids: ['tmdb:1'] }
  let service: RadarrService
  let manager: RadarrManagerService
  let addToRadarr: Mock<RadarrService['addToRadarr']>
  let db: Partial<DatabaseService>

  beforeEach(() => {
    db = {
      getRadarrInstance: vi.fn<DatabaseService['getRadarrInstance']>(
        async () => ({
          ...INSTANCE,
          qualityProfile: '4',
          rootFolder: '/movies',
          tags: ['a', 'a'],
          searchOnAdd: false,
          minimumAvailability: 'announced',
          monitor: 'none',
        }),
      ),
      updateWatchlistItem: vi.fn<DatabaseService['updateWatchlistItem']>(
        async () => undefined,
      ),
    }
    const fastify: Partial<FastifyInstance> = { db: db as DatabaseService }
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as FastifyInstance,
    )
    addToRadarr = vi.spyOn(service, 'addToRadarr').mockResolvedValue(ADDED)
    manager = new RadarrManagerService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
    manager['radarrServices'].set(1, service)
  })

  it('sends the instance values when the settings inherit', async () => {
    const applied = await manager.routeItemToRadarr(item, 'key', 2, 1, false, {
      rootFolder: null,
      qualityProfile: null,
      searchOnAdd: null,
      minimumAvailability: null,
      monitor: null,
    })

    expect(applied).toEqual({
      instanceId: 1,
      instanceType: 'radarr',
      qualityProfile: 6,
      rootFolder: '/sent',
      tags: ['3'],
      searchOnAdd: false,
      minimumAvailability: 'announced',
      monitor: 'none',
    })
    expect(addToRadarr).toHaveBeenCalledWith(
      expect.anything(),
      '/movies',
      4,
      ['a'],
      false,
      'announced',
      'none',
    )
  })

  it('reports what the add service resolved for an instance with no folder, profile or tags', async () => {
    db.getRadarrInstance = vi.fn<DatabaseService['getRadarrInstance']>(
      async () => ({ ...INSTANCE, qualityProfile: null, rootFolder: null }),
    )

    const applied = await manager.routeItemToRadarr(item, 'key', 2, 1, false, {
      tags: [],
    })

    expect(addToRadarr).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      [],
      true,
      'released',
      'movieOnly',
    )
    expect(applied).toMatchObject({
      qualityProfile: 6,
      rootFolder: '/sent',
      tags: ['3'],
    })
  })

  it('sends the settings it was given in place of the instance values', async () => {
    const applied = await manager.routeItemToRadarr(item, 'key', 2, 1, false, {
      rootFolder: '/rule',
      qualityProfile: 9,
      tags: ['b'],
      searchOnAdd: true,
      minimumAvailability: 'released',
      monitor: 'movieOnly',
    })

    expect(applied).toEqual({
      instanceId: 1,
      instanceType: 'radarr',
      qualityProfile: 6,
      rootFolder: '/sent',
      tags: ['3'],
      searchOnAdd: true,
      minimumAvailability: 'released',
      monitor: 'movieOnly',
    })
    expect(addToRadarr).toHaveBeenCalledWith(
      expect.anything(),
      '/rule',
      9,
      ['b'],
      true,
      'released',
      'movieOnly',
    )
  })

  it('refuses an instance that is not set up without calling it', async () => {
    db.getRadarrInstance = vi.fn<DatabaseService['getRadarrInstance']>(
      async () => ({ ...INSTANCE, apiKey: ARR_API_KEY_PLACEHOLDER }),
    )

    await expect(manager.routeItemToRadarr(item, 'key', 2, 1)).rejects.toThrow(
      'is not set up',
    )
    expect(addToRadarr).not.toHaveBeenCalled()
  })
})
