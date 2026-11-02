import type { RouterRule } from '@root/types/router.types.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import { ContentRouterService } from '@services/content-router.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

function rule(id: number): RouterRule {
  return {
    id,
    name: `rule ${id}`,
    type: 'conditional',
    criteria: {
      condition: { field: 'genres', operator: 'contains', value: 'Drama' },
    },
    target_type: 'radarr',
    target_instance_id: 1,
    order: 50,
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

describe('ContentRouterService rules cache', () => {
  let getAllRouterRules: Mock<() => Promise<RouterRule[]>>
  let caches: CacheRegistry
  let service: ContentRouterService

  beforeEach(() => {
    getAllRouterRules = vi.fn<() => Promise<RouterRule[]>>()
    caches = new CacheRegistry()
    const fastify = {
      caches,
      db: {
        getAllRouterRules,
        deleteRouterRule: vi.fn().mockResolvedValue(true),
      },
    } as unknown as FastifyInstance
    service = new ContentRouterService(createMockLogger(), fastify)
  })

  it('serves later reads from one load', async () => {
    getAllRouterRules.mockResolvedValue([rule(1)])

    await service.getAllRouterRules()
    await expect(service.getAllRouterRules()).resolves.toEqual([rule(1)])

    expect(getAllRouterRules).toHaveBeenCalledOnce()
  })

  it('shares one load between concurrent reads', async () => {
    const gate = Promise.withResolvers<RouterRule[]>()
    getAllRouterRules.mockReturnValue(gate.promise)

    const reads = Promise.all([
      service.getAllRouterRules(),
      service.getAllRouterRules(),
    ])
    gate.resolve([rule(1)])

    await expect(reads).resolves.toEqual([[rule(1)], [rule(1)]])
    expect(getAllRouterRules).toHaveBeenCalledOnce()
  })

  it('answers a read started before a clear but never stores its rules', async () => {
    const stale = Promise.withResolvers<RouterRule[]>()
    getAllRouterRules
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue([rule(2)])

    const pending = service.getAllRouterRules()
    service.clearRouterRulesCache()
    stale.resolve([rule(1)])

    await expect(pending).resolves.toEqual([rule(1)])
    await expect(service.getAllRouterRules()).resolves.toEqual([rule(2)])
    await expect(service.getAllRouterRules()).resolves.toEqual([rule(2)])
    expect(getAllRouterRules).toHaveBeenCalledTimes(2)
  })

  it('never stores a failed load', async () => {
    getAllRouterRules
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue([])

    await expect(service.getAllRouterRules()).rejects.toThrow('db down')
    await expect(service.getAllRouterRules()).resolves.toEqual([])
    expect(getAllRouterRules).toHaveBeenCalledTimes(2)
  })

  it('reloads after a rule write', async () => {
    getAllRouterRules.mockResolvedValue([rule(1)])
    await service.getAllRouterRules()

    await service.deleteRouterRule(1)
    getAllRouterRules.mockResolvedValue([])

    await expect(service.getAllRouterRules()).resolves.toEqual([])
    expect(getAllRouterRules).toHaveBeenCalledTimes(2)
  })

  it('reloads after the registry is cleared', async () => {
    getAllRouterRules.mockResolvedValue([rule(1)])
    await service.getAllRouterRules()

    caches.clear()
    await service.getAllRouterRules()

    expect(getAllRouterRules).toHaveBeenCalledTimes(2)
  })
})
