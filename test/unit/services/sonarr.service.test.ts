import type { SonarrInstance, SonarrPost } from '@root/types/sonarr.types.js'
import { SonarrService } from '@services/sonarr.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import { server } from '../../setup/msw-setup.js'

const EXCLUSIONS_URL = 'http://sonarr.test/api/v3/importlistexclusion/paged'

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

function serveExclusions(
  tvdbIds: number[],
  gate?: Promise<void>,
): { calls: number } {
  const counter = { calls: 0 }
  server.use(
    http.get(EXCLUSIONS_URL, async () => {
      counter.calls++
      await gate
      return HttpResponse.json({
        page: 1,
        pageSize: 1000,
        totalRecords: tvdbIds.length,
        records: tvdbIds.map((tvdbId, index) => ({
          id: index + 1,
          tvdbId,
          title: `Excluded ${tvdbId}`,
        })),
      })
    }),
  )
  return counter
}

describe('SonarrService.isTvdbIdExcluded', () => {
  let service: SonarrService

  beforeEach(async () => {
    service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
    )
    await service.initialize(INSTANCE)
  })

  it('resolves true when the exclusion list contains the id', async () => {
    serveExclusions([123])

    await expect(service.isTvdbIdExcluded(123)).resolves.toBe(true)
  })

  it('resolves false when the exclusion list does not contain the id', async () => {
    serveExclusions([123])

    await expect(service.isTvdbIdExcluded(456)).resolves.toBe(false)
  })

  it('shares one fetch between concurrent calls', async () => {
    const counter = serveExclusions([123])

    const results = await Promise.all([
      service.isTvdbIdExcluded(123),
      service.isTvdbIdExcluded(456),
    ])

    expect(results).toEqual([true, false])
    expect(counter.calls).toBe(1)
  })

  it('shares a pending fetch that outlives the TTL', async () => {
    const gate = Promise.withResolvers<void>()
    const counter = serveExclusions([123], gate.promise)
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      const first = service.isTvdbIdExcluded(123)
      clock.mockReturnValue(now + 31_000)
      const second = service.isTvdbIdExcluded(123)
      gate.resolve()

      await expect(Promise.all([first, second])).resolves.toEqual([true, true])
      expect(counter.calls).toBe(1)
    } finally {
      clock.mockRestore()
    }
  })

  it('serves a second call within the TTL from cache', async () => {
    const counter = serveExclusions([123])

    await service.isTvdbIdExcluded(123)
    await service.isTvdbIdExcluded(456)

    expect(counter.calls).toBe(1)
  })

  it('re-reads the list once the TTL has passed', async () => {
    vi.useFakeTimers()
    try {
      const counter = serveExclusions([123])

      await service.isTvdbIdExcluded(123)
      vi.advanceTimersByTime(30_001)
      await service.isTvdbIdExcluded(123)

      expect(counter.calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers after a failed fetch', async () => {
    server.use(
      http.get(EXCLUSIONS_URL, () => new HttpResponse(null, { status: 500 })),
    )
    await expect(service.isTvdbIdExcluded(123)).rejects.toThrow()

    serveExclusions([123])

    await expect(service.isTvdbIdExcluded(123)).resolves.toBe(true)
  })

  it('rejects when the exclusion endpoint fails', async () => {
    server.use(
      http.get(EXCLUSIONS_URL, () => new HttpResponse(null, { status: 500 })),
    )

    await expect(service.isTvdbIdExcluded(123)).rejects.toThrow()
  })
})

describe('SonarrService.addToSonarr', () => {
  let service: SonarrService
  let posted: SonarrPost | undefined

  beforeEach(async () => {
    posted = undefined
    service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
    )
    await service.initialize({ ...INSTANCE, tags: ['5'] })
    server.use(
      http.get('http://sonarr.test/api/v3/rootfolder', () =>
        HttpResponse.json([{ id: 1, path: '/first' }]),
      ),
      http.get('http://sonarr.test/api/v3/qualityprofile', () =>
        HttpResponse.json([{ id: 3, name: 'HD' }]),
      ),
      http.get('http://sonarr.test/api/v3/tag', () =>
        HttpResponse.json([{ id: 5, label: 'kids' }]),
      ),
      http.post('http://sonarr.test/api/v3/series', async ({ request }) => {
        posted = (await request.json()) as SonarrPost
        return HttpResponse.json(
          {
            id: 9,
            rootFolderPath: '/arr-root',
            qualityProfileId: 8,
            tags: [5, 7],
          },
          { status: 201 },
        )
      }),
    )
  })

  it('sends the instance fallbacks and returns what the arr created', async () => {
    const added = await service.addToSonarr(
      { title: 'Show', type: 'show', guids: ['tvdb:1'] },
      undefined,
      undefined,
      [],
    )

    expect(added).toEqual({
      seriesId: 9,
      rootFolder: '/arr-root',
      qualityProfileId: 8,
      tags: ['kids', '7'],
    })
    expect(posted).toMatchObject({
      rootFolderPath: '/first',
      qualityProfileId: 3,
      tags: ['5'],
    })
  })
})
