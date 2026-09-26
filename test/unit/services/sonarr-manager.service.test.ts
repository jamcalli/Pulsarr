import type { SonarrInstance } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { SonarrService } from '@services/sonarr.service.js'
import { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

const INSTANCE: SonarrInstance = {
  id: 1,
  name: 'Test Sonarr',
  baseUrl: 'http://sonarr.test',
  apiKey: 'placeholder',
  bypassIgnored: false,
  seasonMonitoring: 'all',
  monitorNewItems: 'all',
  tags: [],
  isDefault: true,
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
