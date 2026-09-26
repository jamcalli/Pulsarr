import type { RadarrInstance } from '@root/types/radarr.types.js'
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
  apiKey: 'placeholder',
  bypassIgnored: false,
  tags: [],
  isDefault: true,
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
