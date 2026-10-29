import {
  HttpError,
  WebhookCallbackError,
} from '@root/types/arr-connection.types.js'
import type { RadarrInstance, RadarrPost } from '@root/types/radarr.types.js'
import { createArrCaches } from '@services/arr/arr-caches.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
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

  let now: number

  beforeEach(async () => {
    now = 1
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
      createArrCaches(new CacheRegistry({ now: () => now })),
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
    const first = service.isTmdbIdExcluded(123)
    now += 31_000
    const second = service.isTmdbIdExcluded(123)
    gate.resolve()

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(counter.calls).toBe(1)
  })

  it('serves a second call within the TTL from cache', async () => {
    const counter = serveExclusions([123])

    await service.isTmdbIdExcluded(123)
    await service.isTmdbIdExcluded(456)

    expect(counter.calls).toBe(1)
  })

  it('re-reads the list once the TTL has passed', async () => {
    const counter = serveExclusions([123])

    await service.isTmdbIdExcluded(123)
    now += 30_001
    await service.isTmdbIdExcluded(123)

    expect(counter.calls).toBe(2)
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
      createArrCaches(new CacheRegistry()),
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
      createArrCaches(new CacheRegistry()),
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

    const result = initialize()
    await expect(result).rejects.toBeInstanceOf(WebhookCallbackError)
    await expect(result).rejects.toThrow('Unable to send test message')
    expect(requests).toEqual([{ method: 'PUT', id: 172 }])
  })

  describe('testWebhookCallback', () => {
    function serveCallbackTest(status: number) {
      server.use(
        http.post(`${NOTIFICATION_URL}/test`, async ({ request }) => {
          const body = (await request.json()) as { id?: number }
          requests.push(
            'id' in body ? { method: 'TEST', id: body.id } : { method: 'TEST' },
          )
          if (status === 200) return HttpResponse.json({})
          return status === 400
            ? HttpResponse.json(
                [
                  {
                    propertyName: 'Url',
                    errorMessage: 'Unable to send test message',
                  },
                ],
                { status },
              )
            : HttpResponse.json(
                { message: 'Unable to send test message: Connection refused' },
                { status },
              )
        }),
      )
    }

    const testCallback = () =>
      service.testWebhookCallback({ ...INSTANCE, apiKey: 'real-key' })

    it('posts the test with the current hook id', async () => {
      serveHooks([
        { id: 172, name: service.getWebhookName(), url: 'http://stale' },
        { id: 50, name: 'Pulsarr', url: expectedUrl },
      ])
      serveCallbackTest(200)

      await testCallback()

      expect(requests).toStrictEqual([{ method: 'TEST', id: 172 }])
    })

    it('posts the test with the legacy hook id when only legacy exists', async () => {
      serveHooks([{ id: 50, name: 'Pulsarr', url: expectedUrl }])
      serveCallbackTest(200)

      await testCallback()

      expect(requests).toStrictEqual([{ method: 'TEST', id: 50 }])
    })

    it('posts the test without an id when no Pulsarr hook exists', async () => {
      serveHooks([{ id: 50, name: 'Pulsarr', url: 'http://other-pulsarr' }])
      serveCallbackTest(200)

      await testCallback()

      expect(requests).toStrictEqual([{ method: 'TEST' }])
    })

    it.each([400, 500])(
      'throws WebhookCallbackError on a %i',
      async (status) => {
        serveHooks([
          { id: 172, name: service.getWebhookName(), url: 'http://stale' },
        ])
        serveCallbackTest(status)

        const result = testCallback()
        await expect(result).rejects.toBeInstanceOf(WebhookCallbackError)
        await expect(result).rejects.toThrow('Unable to send test message')
        expect(requests).toStrictEqual([{ method: 'TEST', id: 172 }])
      },
    )

    it('rethrows a network error unchanged', async () => {
      serveHooks([])
      server.use(
        http.post(`${NOTIFICATION_URL}/test`, () => HttpResponse.error()),
      )

      const result = testCallback()
      await expect(result).rejects.toBeInstanceOf(Error)
      await expect(result).rejects.not.toBeInstanceOf(WebhookCallbackError)
      expect(requests).toEqual([])
    })

    it('rethrows a 400 Name failure as an HttpError', async () => {
      serveHooks([])
      server.use(
        http.post(`${NOTIFICATION_URL}/test`, () =>
          HttpResponse.json(
            [{ propertyName: 'Name', errorMessage: 'Name should be unique' }],
            { status: 400 },
          ),
        ),
      )

      const result = testCallback()
      await expect(result).rejects.toBeInstanceOf(HttpError)
      await expect(result).rejects.not.toBeInstanceOf(WebhookCallbackError)
      await expect(result).rejects.toThrow('Name should be unique')
    })
  })
})

describe('RadarrService webhook definition', () => {
  const fastify = {
    server: { listening: true },
    config: { basePath: '/', webhookSecret: 'secret' },
  } as unknown as FastifyInstance

  it('tests the same webhook definition that setupWebhook registers', async () => {
    const bodies: { test?: object; create?: object } = {}
    server.use(
      http.get('http://radarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Radarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://radarr.test/api/v3/notification', () =>
        HttpResponse.json([]),
      ),
      http.post(
        'http://radarr.test/api/v3/notification/test',
        async ({ request }) => {
          bodies.test = (await request.json()) as object
          return HttpResponse.json('{}')
        },
      ),
      http.post(
        'http://radarr.test/api/v3/notification',
        async ({ request }) => {
          bodies.create = (await request.json()) as object
          return HttpResponse.json({ id: 1 }, { status: 201 })
        },
      ),
    )

    const tester = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )
    const result = await tester.testConnection('http://radarr.test', 'key')
    expect(result).toEqual({
      success: true,
      code: null,
      message: 'Connection successful and webhook API accessible',
    })

    const registrar = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )
    await registrar.initialize({ ...INSTANCE, apiKey: 'key' })

    expect(bodies.test).toBeDefined()
    expect(bodies.test).toEqual(bodies.create)
  })

  it('succeeds when the notification test returns no content', async () => {
    server.use(
      http.get('http://radarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Radarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://radarr.test/api/v3/notification', () =>
        HttpResponse.json([]),
      ),
      http.post(
        'http://radarr.test/api/v3/notification/test',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const tester = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )

    const result = await tester.testConnection('http://radarr.test', 'key')

    expect(result).toEqual({
      success: true,
      code: null,
      message: 'Connection successful and webhook API accessible',
    })
  })

  it('reports a webhook callback failure when the callback test times out', async () => {
    const controllers: AbortController[] = []
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      controllers.push(controller)
      return controller.signal
    })
    server.use(
      http.get('http://radarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Radarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://radarr.test/api/v3/notification', () =>
        HttpResponse.json([]),
      ),
      http.post('http://radarr.test/api/v3/notification/test', () => {
        controllers.at(-1)?.abort(new DOMException('timed out', 'TimeoutError'))
        return new Promise<never>(() => {})
      }),
    )
    const tester = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )

    try {
      const result = await tester.testConnection('http://radarr.test', 'key')

      expect(result).toEqual({
        success: false,
        code: 'webhook_callback_failed',
        message:
          'Radarr did not finish calling Pulsarr back in time. Check the webhook address.',
      })
      expect(timeout.mock.calls).toEqual([[10000], [10000], [10000]])
    } finally {
      timeout.mockRestore()
    }
  })

  it('reports unreachable when the notification list times out', async () => {
    const controllers: AbortController[] = []
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      controllers.push(controller)
      return controller.signal
    })
    server.use(
      http.get('http://radarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Radarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://radarr.test/api/v3/notification', () => {
        controllers.at(-1)?.abort(new DOMException('timed out', 'TimeoutError'))
        return new Promise<never>(() => {})
      }),
    )
    const tester = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )

    try {
      const result = await tester.testConnection('http://radarr.test', 'key')

      expect(result).toMatchObject({ success: false, code: 'unreachable' })
    } finally {
      timeout.mockRestore()
    }
  })

  it('reports auth when the notification list is forbidden', async () => {
    server.use(
      http.get('http://radarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Radarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get(
        'http://radarr.test/api/v3/notification',
        () => new HttpResponse(null, { status: 403 }),
      ),
    )
    const tester = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )

    const result = await tester.testConnection('http://radarr.test', 'key')

    expect(result).toEqual({
      success: false,
      code: 'auth',
      message:
        'Connected to Radarr but cannot access notification API. Check API key permissions.',
    })
  })

  it.each([
    {
      label: 'carries the existing hook id',
      hooks: [{ id: 172, name: 'Pulsarr (localhost:3003)', fields: [] }],
      id: 172,
    },
    {
      label: 'carries no id without an existing hook',
      hooks: [],
      id: undefined,
    },
  ])('$label in the notification test body', async ({ hooks, id }) => {
    let testBody: { id?: number } | undefined
    server.use(
      http.get('http://radarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Radarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://radarr.test/api/v3/notification', () =>
        HttpResponse.json(hooks),
      ),
      http.post(
        'http://radarr.test/api/v3/notification/test',
        async ({ request }) => {
          testBody = (await request.json()) as { id?: number }
          return HttpResponse.json('{}')
        },
      ),
    )
    const tester = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
      createArrCaches(new CacheRegistry()),
    )

    await tester.testConnection('http://radarr.test', 'key')

    expect(testBody?.id).toBe(id)
  })
})

describe('RadarrService.probe', () => {
  it('reads the routing options with credentials and never initializes', async () => {
    server.use(
      http.get('http://radarr.test/api/v3/qualityprofile', () =>
        HttpResponse.json([{ id: 3, name: 'HD' }]),
      ),
      http.get('http://radarr.test/api/v3/rootfolder', () =>
        HttpResponse.json([{ id: 1, path: '/media' }]),
      ),
      http.get('http://radarr.test/api/v3/tag', () =>
        HttpResponse.json([{ id: 5, label: 'kids' }]),
      ),
    )
    const service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
      createArrCaches(new CacheRegistry()),
    )
    const initialize = vi.spyOn(service, 'initialize')

    await expect(service.probe('http://radarr.test', 'key')).resolves.toEqual({
      qualityProfiles: [{ id: 3, name: 'HD' }],
      rootFolders: [{ id: 1, path: '/media' }],
      tags: [{ id: 5, label: 'kids' }],
    })
    expect(initialize).not.toHaveBeenCalled()
  })
})

describe('RadarrService full library reads', () => {
  let service: RadarrService
  let queries: string[]

  beforeEach(async () => {
    queries = []
    service = new RadarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
      createArrCaches(new CacheRegistry()),
    )
    await service.initialize(INSTANCE)
    server.use(
      http.get('http://radarr.test/api/v3/movie', ({ request }) => {
        queries.push(new URL(request.url).search)
        return HttpResponse.json([{ id: 1, title: 'Movie', tmdbId: 5 }])
      }),
    )
  })

  it('skips local cover mapping on every full fetch', async () => {
    await service.getAllMovies()
    await service.fetchMovies(true)

    expect(queries).toEqual([
      '?excludeLocalCovers=true',
      '?excludeLocalCovers=true',
    ])
  })
})
