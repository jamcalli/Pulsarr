import { MaintainerrService } from '@services/maintainerr/maintainerr.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

const BASE = 'http://maintainerr.test:6246'

function makeService(configOverrides: Record<string, unknown> = {}) {
  const fastify = {
    config: {
      maintainerrEnabled: true,
      maintainerrUrl: BASE,
      maintainerrWebhookSecret: 'test-maintainerr-secret',
      baseUrl: 'http://pulsarr.test',
      basePath: '/',
      port: 3003,
      ...configOverrides,
    },
  } as unknown as FastifyInstance
  return new MaintainerrService(createMockLogger(), fastify)
}

interface RecordedRequest {
  path: string
  body: unknown
}

function stubMaintainerr(options: {
  version?: string
  configurations?: unknown[]
  configurationsAfterAdd?: unknown[]
  recorded?: RecordedRequest[]
}) {
  const recorded = options.recorded ?? []
  let addSeen = false

  server.use(
    http.get(`${BASE}/api/settings/version`, () =>
      HttpResponse.text(options.version ?? '3.23.0'),
    ),
    http.get(`${BASE}/api/notifications/configurations`, () =>
      HttpResponse.json(
        addSeen
          ? (options.configurationsAfterAdd ?? options.configurations ?? [])
          : (options.configurations ?? []),
      ),
    ),
    http.post(
      `${BASE}/api/notifications/configuration/add`,
      async ({ request }) => {
        addSeen = true
        recorded.push({
          path: '/configuration/add',
          body: await request.json(),
        })
        return HttpResponse.json({ code: 1, status: 'OK' })
      },
    ),
    http.post(
      `${BASE}/api/notifications/configuration/connect`,
      async ({ request }) => {
        recorded.push({
          path: '/configuration/connect',
          body: await request.json(),
        })
        return HttpResponse.json({ code: 1, status: 'OK' })
      },
    ),
    http.post(
      `${BASE}/api/notifications/configuration/disconnect`,
      async ({ request }) => {
        recorded.push({
          path: '/configuration/disconnect',
          body: await request.json(),
        })
        return HttpResponse.json({ code: 1, status: 'OK' })
      },
    ),
    // /test responds with a bare string, not JSON
    http.post(`${BASE}/api/notifications/test`, async ({ request }) => {
      recorded.push({ path: '/test', body: await request.json() })
      return HttpResponse.text('Success')
    }),
  )

  return recorded
}

const PULSARR_CONFIG = {
  id: 7,
  name: 'Pulsarr',
  agent: 'webhook',
  enabled: true,
  types: [16],
  options: {},
}

describe('MaintainerrService.reconcile', () => {
  let service: MaintainerrService

  beforeEach(() => {
    service = makeService()
  })

  it('returns disabled when no url is configured', async () => {
    const result = await makeService({ maintainerrUrl: '' }).reconcile()
    expect(result.status).toBe('disabled')
  })

  it('disables the remote config when the integration is toggled off', async () => {
    const disabledService = makeService({ maintainerrEnabled: false })
    const recorded = stubMaintainerr({
      configurations: [{ ...PULSARR_CONFIG, enabled: true }],
    })

    const result = await disabledService.reconcile()

    expect(result.status).toBe('disabled')
    const add = recorded.find((r) => r.path === '/configuration/add')
    const addBody = add?.body as { id?: number; enabled?: boolean }
    expect(addBody.id).toBe(7)
    expect(addBody.enabled).toBe(false)
  })

  it('rejects versions below 3.23.0', async () => {
    stubMaintainerr({ version: '3.22.1' })
    const result = await service.reconcile()
    expect(result).toEqual({ status: 'unsupported_version', version: '3.22.1' })
  })

  it('rejects prereleases of the minimum version', async () => {
    stubMaintainerr({ version: '3.23.0-rc.1' })
    const result = await service.reconcile()
    expect(result).toEqual({
      status: 'unsupported_version',
      version: '3.23.0-rc.1',
    })
  })

  it('provisions the webhook config and connects delete-action rule groups only', async () => {
    const recorded = stubMaintainerr({
      configurations: [],
      configurationsAfterAdd: [PULSARR_CONFIG],
    })
    server.use(
      http.get(`${BASE}/api/rules`, () =>
        HttpResponse.json([
          // DELETE action, unconnected -> connect
          {
            id: 1,
            name: 'del',
            isActive: true,
            collection: { id: 10, arrAction: 0 },
            notifications: [],
          },
          // UNMONITOR action, connected -> disconnect
          {
            id: 2,
            name: 'unmon',
            isActive: true,
            collection: { id: 11, arrAction: 3 },
            notifications: [{ id: 7 }],
          },
          // DELETE action, already connected -> untouched
          {
            id: 3,
            name: 'del2',
            isActive: true,
            collection: { id: 12, arrAction: 1 },
            notifications: [{ id: 7 }],
          },
        ]),
      ),
    )

    // The real receiver records the test receipt while Maintainerr's /test
    // call is in flight; simulate that ordering from the handler
    server.use(
      http.post(`${BASE}/api/notifications/test`, async ({ request }) => {
        recorded.push({ path: '/test', body: await request.json() })
        service.recordTestReceipt()
        return HttpResponse.text('Success')
      }),
    )

    const result = await service.reconcile()

    expect(result.status).toBe('ok')
    expect(result.configId).toBe(7)
    expect(result.connectedGroups).toBe(2)
    expect(result.testDelivered).toBe(true)

    const add = recorded.find((r) => r.path === '/configuration/add')
    expect(add).toBeDefined()
    const addBody = add?.body as {
      types: number[]
      options: { webhookUrl: string; authHeader: string; jsonPayload: unknown }
    }
    expect(addBody.types).toEqual([16])
    expect(addBody.options.webhookUrl).toBe(
      'http://pulsarr.test:3003/v1/notifications/webhook/maintainerr',
    )
    expect(addBody.options.authHeader).toBe('test-maintainerr-secret')
    expect(typeof addBody.options.jsonPayload).toBe('object')

    expect(recorded.filter((r) => r.path === '/configuration/connect')).toEqual(
      [
        {
          path: '/configuration/connect',
          body: { rulegroupId: 1, notificationId: 7 },
        },
      ],
    )
    expect(
      recorded.filter((r) => r.path === '/configuration/disconnect'),
    ).toEqual([
      {
        path: '/configuration/disconnect',
        body: { rulegroupId: 2, notificationId: 7 },
      },
    ])
  })

  it('updates an existing config in place instead of creating a duplicate', async () => {
    const recorded = stubMaintainerr({
      configurations: [PULSARR_CONFIG],
    })
    server.use(http.get(`${BASE}/api/rules`, () => HttpResponse.json([])))

    const result = await service.reconcile()

    expect(result.status).toBe('ok')
    const add = recorded.find((r) => r.path === '/configuration/add')
    const addBody = add?.body as { id?: number }
    expect(addBody.id).toBe(7)
  })

  it('reports a code 0 mutation response as an error', async () => {
    stubMaintainerr({ configurations: [PULSARR_CONFIG] })
    server.use(
      http.post(`${BASE}/api/notifications/configuration/add`, () =>
        HttpResponse.json({ code: 0, status: 'NOK', message: 'boom' }),
      ),
    )

    const result = await service.reconcile()

    expect(result.status).toBe('error')
    expect(result.error).toContain('boom')
  })

  it('reports an unreachable Maintainerr as an error', async () => {
    server.use(
      http.get(`${BASE}/api/settings/version`, () => HttpResponse.error()),
    )
    const result = await service.reconcile()
    expect(result.status).toBe('error')
  })

  it('flags an undelivered test round trip', async () => {
    stubMaintainerr({
      configurations: [PULSARR_CONFIG],
    })
    server.use(http.get(`${BASE}/api/rules`, () => HttpResponse.json([])))

    const result = await service.reconcile()

    expect(result.status).toBe('ok')
    expect(result.testDelivered).toBe(false)
  })

  it('surfaces the delivery failure reason from the test response', async () => {
    stubMaintainerr({ configurations: [PULSARR_CONFIG] })
    server.use(
      http.get(`${BASE}/api/rules`, () => HttpResponse.json([])),
      http.post(`${BASE}/api/notifications/test`, () =>
        HttpResponse.text('Failure: connect ECONNREFUSED'),
      ),
    )

    const result = await service.reconcile()

    expect(result.status).toBe('ok')
    expect(result.testDelivered).toBe(false)
    expect(result.error).toBe('Failure: connect ECONNREFUSED')
  })

  it('runs once more when a caller arrives mid-reconcile', async () => {
    let fetches = 0
    let releaseFirst: (() => void) | undefined
    const firstFetchStarted = new Promise<void>((resolve) => {
      server.use(
        http.get(`${BASE}/api/settings/version`, async () => {
          fetches++
          if (fetches === 1) {
            resolve()
            await new Promise<void>((r) => {
              releaseFirst = r
            })
          }
          return HttpResponse.text('3.22.1')
        }),
      )
    })

    const first = service.reconcile()
    await firstFetchStarted
    const second = service.reconcile()

    releaseFirst?.()
    const [firstResult, secondResult] = await Promise.all([first, second])

    // The joined caller shares the promise, and its arrival triggers a
    // second full run - visible as one extra version fetch
    expect(firstResult).toBe(secondResult)
    expect(firstResult.status).toBe('unsupported_version')
    expect(fetches).toBe(2)
  })
})
