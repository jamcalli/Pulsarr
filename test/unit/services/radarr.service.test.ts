import type { RadarrInstance } from '@root/types/radarr.types.js'
import { RadarrService } from '@services/radarr.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import { server } from '../../setup/msw-setup.js'

const EXCLUSIONS_URL = 'http://radarr.test/api/v3/exclusions/paged'

const INSTANCE: RadarrInstance = {
  id: 1,
  name: 'Test Radarr',
  baseUrl: 'http://radarr.test',
  apiKey: 'placeholder',
  bypassIgnored: false,
  tags: [],
  isDefault: true,
}

function serveExclusions(tmdbIds: number[]): { calls: number } {
  const counter = { calls: 0 }
  server.use(
    http.get(EXCLUSIONS_URL, () => {
      counter.calls++
      return HttpResponse.json({
        page: 1,
        pageSize: 1000,
        totalRecords: tmdbIds.length,
        records: tmdbIds.map((tmdbId, index) => ({
          id: index + 1,
          tmdbId,
          movieTitle: `Excluded ${tmdbId}`,
          movieYear: 2020,
        })),
      })
    }),
  )
  return counter
}

describe('RadarrService.isTmdbIdExcluded', () => {
  let service: RadarrService

  beforeEach(async () => {
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
    )
    await service.initialize(INSTANCE)
  })

  it('resolves true when the exclusion list contains the id', async () => {
    serveExclusions([123])

    await expect(service.isTmdbIdExcluded(123)).resolves.toBe(true)
  })

  it('resolves false when the exclusion list does not contain the id', async () => {
    serveExclusions([123])

    await expect(service.isTmdbIdExcluded(456)).resolves.toBe(false)
  })

  it('shares one fetch between concurrent calls', async () => {
    const counter = serveExclusions([123])

    const results = await Promise.all([
      service.isTmdbIdExcluded(123),
      service.isTmdbIdExcluded(456),
    ])

    expect(results).toEqual([true, false])
    expect(counter.calls).toBe(1)
  })

  it('serves a second call within the TTL from cache', async () => {
    const counter = serveExclusions([123])

    await service.isTmdbIdExcluded(123)
    await service.isTmdbIdExcluded(456)

    expect(counter.calls).toBe(1)
  })

  it('re-reads the list once the TTL has passed', async () => {
    vi.useFakeTimers()
    try {
      const counter = serveExclusions([123])

      await service.isTmdbIdExcluded(123)
      vi.advanceTimersByTime(30_001)
      await service.isTmdbIdExcluded(123)

      expect(counter.calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers after a failed fetch', async () => {
    server.use(
      http.get(EXCLUSIONS_URL, () => new HttpResponse(null, { status: 500 })),
    )
    await expect(service.isTmdbIdExcluded(123)).rejects.toThrow()

    serveExclusions([123])

    await expect(service.isTmdbIdExcluded(123)).resolves.toBe(true)
  })

  it('rejects when the exclusion endpoint fails', async () => {
    server.use(
      http.get(EXCLUSIONS_URL, () => new HttpResponse(null, { status: 500 })),
    )

    await expect(service.isTmdbIdExcluded(123)).rejects.toThrow()
  })
})
