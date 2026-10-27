import {
  HttpError,
  WebhookCallbackError,
} from '@root/types/arr-connection.types.js'
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

describe('SonarrService webhook setup', () => {
  const NOTIFICATION_URL = 'http://sonarr.test/api/v3/notification'
  let service: SonarrService
  let requests: Array<{ method: string; id?: number }>
  let lastDefinition: Record<string, unknown> | null

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
        lastDefinition = body
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
    lastDefinition = null
    const fastify = {
      server: { listening: true },
      config: { basePath: '/', webhookSecret: 'secret' },
    }
    service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify as unknown as FastifyInstance,
    )
  })

  const expectedUrl =
    'http://localhost:3003/v1/notifications/webhook?instanceId=sonarrtest'

  it('subscribes to per-file downloads only, never upgrades or import complete', async () => {
    serveHooks([
      { id: 172, name: service.getWebhookName(), url: 'http://stale' },
    ])

    await initialize()

    expect(lastDefinition).toMatchObject({
      onDownload: true,
      onUpgrade: false,
      onImportComplete: false,
    })
  })

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

describe('SonarrService webhook definition', () => {
  const fastify = {
    server: { listening: true },
    config: { basePath: '/', webhookSecret: 'secret' },
  } as unknown as FastifyInstance

  it('tests the same webhook definition that setupWebhook registers', async () => {
    const bodies: { test?: object; create?: object } = {}
    server.use(
      http.get('http://sonarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Sonarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://sonarr.test/api/v3/notification', () =>
        HttpResponse.json([]),
      ),
      http.post(
        'http://sonarr.test/api/v3/notification/test',
        async ({ request }) => {
          bodies.test = (await request.json()) as object
          return HttpResponse.json('{}')
        },
      ),
      http.post(
        'http://sonarr.test/api/v3/notification',
        async ({ request }) => {
          bodies.create = (await request.json()) as object
          return HttpResponse.json({ id: 1 }, { status: 201 })
        },
      ),
    )

    const tester = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )
    const result = await tester.testConnection('http://sonarr.test', 'key')
    expect(result).toEqual({
      success: true,
      code: null,
      message: 'Connection successful and webhook API accessible',
    })

    const registrar = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )
    await registrar.initialize({ ...INSTANCE, apiKey: 'key' })

    expect(bodies.test).toBeDefined()
    expect(bodies.test).toEqual(bodies.create)
  })

  it('succeeds when the notification test returns no content', async () => {
    server.use(
      http.get('http://sonarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Sonarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://sonarr.test/api/v3/notification', () =>
        HttpResponse.json([]),
      ),
      http.post(
        'http://sonarr.test/api/v3/notification/test',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const tester = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )

    const result = await tester.testConnection('http://sonarr.test', 'key')

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
      http.get('http://sonarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Sonarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://sonarr.test/api/v3/notification', () =>
        HttpResponse.json([]),
      ),
      http.post('http://sonarr.test/api/v3/notification/test', () => {
        controllers.at(-1)?.abort(new DOMException('timed out', 'TimeoutError'))
        return new Promise<never>(() => {})
      }),
    )
    const tester = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )

    try {
      const result = await tester.testConnection('http://sonarr.test', 'key')

      expect(result).toEqual({
        success: false,
        code: 'webhook_callback_failed',
        message:
          'Sonarr did not finish calling Pulsarr back in time. Check the webhook address.',
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
      http.get('http://sonarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Sonarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://sonarr.test/api/v3/notification', () => {
        controllers.at(-1)?.abort(new DOMException('timed out', 'TimeoutError'))
        return new Promise<never>(() => {})
      }),
    )
    const tester = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )

    try {
      const result = await tester.testConnection('http://sonarr.test', 'key')

      expect(result).toMatchObject({ success: false, code: 'unreachable' })
    } finally {
      timeout.mockRestore()
    }
  })

  it('reports auth when the notification list is forbidden', async () => {
    server.use(
      http.get('http://sonarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Sonarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get(
        'http://sonarr.test/api/v3/notification',
        () => new HttpResponse(null, { status: 403 }),
      ),
    )
    const tester = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )

    const result = await tester.testConnection('http://sonarr.test', 'key')

    expect(result).toEqual({
      success: false,
      code: 'auth',
      message:
        'Connected to Sonarr but cannot access notification API. Check API key permissions.',
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
      http.get('http://sonarr.test/api/v3/system/status', () =>
        HttpResponse.json({
          appName: 'Sonarr',
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get('http://sonarr.test/api/v3/notification', () =>
        HttpResponse.json(hooks),
      ),
      http.post(
        'http://sonarr.test/api/v3/notification/test',
        async ({ request }) => {
          testBody = (await request.json()) as { id?: number }
          return HttpResponse.json('{}')
        },
      ),
    )
    const tester = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      fastify,
    )

    await tester.testConnection('http://sonarr.test', 'key')

    expect(testBody?.id).toBe(id)
  })
})

describe('SonarrService.probe', () => {
  it('reads the routing options with credentials and never initializes', async () => {
    server.use(
      http.get('http://sonarr.test/api/v3/qualityprofile', () =>
        HttpResponse.json([{ id: 3, name: 'HD' }]),
      ),
      http.get('http://sonarr.test/api/v3/rootfolder', () =>
        HttpResponse.json([{ id: 1, path: '/media' }]),
      ),
      http.get('http://sonarr.test/api/v3/tag', () =>
        HttpResponse.json([{ id: 5, label: 'kids' }]),
      ),
    )
    const service = new SonarrService(
      createMockLogger(),
      'http://localhost',
      3003,
      {} as FastifyInstance,
    )
    const initialize = vi.spyOn(service, 'initialize')

    await expect(service.probe('http://sonarr.test', 'key')).resolves.toEqual({
      qualityProfiles: [{ id: 3, name: 'HD' }],
      rootFolders: [{ id: 1, path: '/media' }],
      tags: [{ id: 5, label: 'kids' }],
    })
    expect(initialize).not.toHaveBeenCalled()
  })
})
