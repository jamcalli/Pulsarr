import type { RadarrInstance, RadarrPost } from '@root/types/radarr.types.js'
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

function serveExclusions(
  tmdbIds: number[],
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

  it('shares a pending fetch that outlives the TTL', async () => {
    const gate = Promise.withResolvers<void>()
    const counter = serveExclusions([123], gate.promise)
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      const first = service.isTmdbIdExcluded(123)
      clock.mockReturnValue(now + 31_000)
      const second = service.isTmdbIdExcluded(123)
      gate.resolve()

      await expect(Promise.all([first, second])).resolves.toEqual([true, true])
      expect(counter.calls).toBe(1)
    } finally {
      clock.mockRestore()
    }
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

describe('RadarrService.addToRadarr', () => {
  let service: RadarrService
  let posted: RadarrPost | undefined

  beforeEach(async () => {
    posted = undefined
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
    )
    await service.initialize({ ...INSTANCE, tags: ['5'] })
    server.use(
      http.get('http://radarr.test/api/v3/rootfolder', () =>
        HttpResponse.json([{ id: 1, path: '/first' }]),
      ),
      http.get('http://radarr.test/api/v3/qualityprofile', () =>
        HttpResponse.json([{ id: 3, name: 'HD' }]),
      ),
      http.get('http://radarr.test/api/v3/tag', () =>
        HttpResponse.json([{ id: 5, label: 'kids' }]),
      ),
      http.post('http://radarr.test/api/v3/movie', async ({ request }) => {
        posted = (await request.json()) as RadarrPost
        return HttpResponse.json(
          {
            id: 1,
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
    const added = await service.addToRadarr(
      { title: 'Movie', type: 'movie', guids: ['tmdb:1'] },
      undefined,
      undefined,
      [],
    )

    expect(added).toEqual({
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

describe('RadarrService webhook setup', () => {
  const NOTIFICATION_URL = 'http://radarr.test/api/v3/notification'
  let service: RadarrService
  let requests: Array<{ method: string; id?: number }>

  function serveHooks(
    hooks: Array<{ id: number; name: string; url: string }>,
    putStatus = 202,
    deleteStatus = 200,
  ) {
    server.use(
      http.get(NOTIFICATION_URL, () =>
        HttpResponse.json(
          hooks.map((hook) => ({
            id: hook.id,
            name: hook.name,
            fields: [{ name: 'url', value: hook.url }],
          })),
        ),
      ),
      http.put(`${NOTIFICATION_URL}/:id`, async ({ request, params }) => {
        const body = (await request.json()) as { id: number }
        requests.push({ method: 'PUT', id: Number(params.id) })
        expect(body.id).toBe(Number(params.id))
        return putStatus === 202
          ? HttpResponse.json(body.id, { status: 202 })
          : HttpResponse.json(
              [
                {
                  propertyName: 'Url',
                  errorMessage: 'Unable to send test message',
                },
              ],
              { status: putStatus },
            )
      }),
      http.post(NOTIFICATION_URL, () => {
        requests.push({ method: 'POST' })
        return HttpResponse.json({ id: 9 }, { status: 201 })
      }),
      http.delete(`${NOTIFICATION_URL}/:id`, ({ params }) => {
        requests.push({ method: 'DELETE', id: Number(params.id) })
        return HttpResponse.json({}, { status: deleteStatus })
      }),
    )
  }

  async function initialize() {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      await Promise.all([
        service.initialize({ ...INSTANCE, apiKey: 'real-key' }),
        vi.advanceTimersByTimeAsync(1000),
      ])
    } finally {
      vi.useRealTimers()
    }
  }

  beforeEach(() => {
    requests = []
    const fastify = {
      server: { listening: true },
      config: { basePath: '/', webhookSecret: 'secret' },
    }
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as unknown as FastifyInstance,
    )
  })

  const expectedUrl =
    'http://localhost:3003/v1/notifications/webhook?instanceId=radarrtest'

  it('updates the current hook by id', async () => {
    serveHooks([
      { id: 172, name: service.getWebhookName(), url: 'http://stale' },
      { id: 50, name: 'Pulsarr', url: expectedUrl },
    ])

    await initialize()

    expect(requests).toEqual([
      { method: 'PUT', id: 172 },
      { method: 'DELETE', id: 50 },
    ])
  })

  it('migrates a legacy hook by updating it in place', async () => {
    serveHooks([{ id: 50, name: 'Pulsarr', url: expectedUrl }])

    await initialize()

    expect(requests).toEqual([{ method: 'PUT', id: 50 }])
  })

  it('creates a hook when none exists', async () => {
    serveHooks([{ id: 50, name: 'Pulsarr', url: 'http://other-pulsarr' }])

    await initialize()

    expect(requests).toEqual([{ method: 'POST' }])
  })

  it('keeps the updated hook when the legacy cleanup fails', async () => {
    serveHooks(
      [
        { id: 172, name: service.getWebhookName(), url: 'http://stale' },
        { id: 50, name: 'Pulsarr', url: expectedUrl },
      ],
      202,
      500,
    )

    await initialize()

    expect(requests).toEqual([
      { method: 'PUT', id: 172 },
      { method: 'DELETE', id: 50 },
    ])
  })

  it('never deletes a hook when the update is rejected', async () => {
    serveHooks(
      [
        { id: 172, name: service.getWebhookName(), url: 'http://stale' },
        { id: 50, name: 'Pulsarr', url: expectedUrl },
      ],
      400,
    )

    await expect(initialize()).rejects.toThrow('Unable to send test message')
    expect(requests).toEqual([{ method: 'PUT', id: 172 }])
  })
})
