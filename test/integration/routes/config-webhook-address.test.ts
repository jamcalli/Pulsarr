import { ARR_API_KEY_PLACEHOLDER } from '@root/schemas/common/arr-placeholder.js'
import type {
  ConfigConflict,
  ConfigResponse,
} from '@root/schemas/config/config.schema.js'
import { createArrCaches } from '@services/arr/arr-caches.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import { RadarrService } from '@services/radarr.service.js'
import { SonarrService } from '@services/sonarr.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import {
  arrWebhookMocks,
  resetArrWebhookMock,
} from '../../mocks/plex-api-handlers.js'
import { server } from '../../setup/msw-setup.js'

const ARRS = ['radarr', 'sonarr'] as const

describe('PUT /v1/config webhook address gate', () => {
  let app: FastifyInstance
  let originalBaseUrl: string
  let originalPort: number

  const webhookName = (
    arr: (typeof ARRS)[number],
    baseUrl = app.config.baseUrl,
  ) =>
    (arr === 'radarr'
      ? new RadarrService(
          app.log,
          baseUrl,
          app.config.port,
          app,
          createArrCaches(new CacheRegistry()),
        )
      : new SonarrService(
          app.log,
          baseUrl,
          app.config.port,
          app,
          createArrCaches(new CacheRegistry()),
        )
    ).getWebhookName()

  const putConfig = (payload: Record<string, string | number | boolean>) =>
    app.inject({ method: 'PUT', url: '/v1/config', payload })

  const storedBaseUrl = async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/config' })
    return res.json<ConfigResponse>().config.baseUrl
  }

  beforeAll(async () => {
    app = await build()
    await app.ready()
    originalBaseUrl = app.config.baseUrl
    originalPort = app.config.port
    vi.spyOn(app.server, 'listening', 'get').mockReturnValue(true)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await app.close()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await resetDatabase()
    await seedAll(knex)
    app.config.authenticationMethod = 'disabled'
    app.contentRouter.clearRouterRulesCache()

    for (const arr of ARRS) {
      resetArrWebhookMock(arr, [
        { id: 172, name: webhookName(arr), url: 'http://localhost/stale' },
      ])
    }
    await Promise.all([
      app.radarrManager.resyncWebhooks(),
      app.sonarrManager.resyncWebhooks(),
    ])
    for (const arr of ARRS) {
      resetArrWebhookMock(arr, arrWebhookMocks[arr].hooks)
    }
  })

  afterEach(() => {
    app.config.baseUrl = originalBaseUrl
    app.config.port = originalPort
  })

  it('makes no arr calls when the address is unchanged', async () => {
    const res = await putConfig({ tmdbRegion: 'GB' })

    expect(res.statusCode).toBe(200)
    expect(res.json<ConfigResponse>().webhooks).toBeUndefined()
    for (const arr of ARRS) {
      expect(arrWebhookMocks[arr].requests).toEqual([])
    }
  })

  it('rejects an address the arrs cannot call back and saves nothing', async () => {
    const before = await storedBaseUrl()
    const original = Object.fromEntries(
      ARRS.map((arr) => [arr, structuredClone(arrWebhookMocks[arr].hooks)]),
    )

    const res = await putConfig({ baseUrl: 'http://unreachable.invalid' })

    expect(res.statusCode).toBe(409)
    const body = res.json<ConfigConflict>()
    for (const arr of ARRS) {
      expect(body.webhooks?.[arr]).toEqual([
        expect.objectContaining({
          success: false,
          code: 'callback_failed',
          message: expect.stringContaining('Unable to send test message'),
        }),
      ])
      expect(arrWebhookMocks[arr].requests).toEqual([
        {
          method: 'TEST',
          name: webhookName(arr, 'http://unreachable.invalid'),
        },
      ])
      expect(arrWebhookMocks[arr].hooks).toEqual(original[arr])
    }
    expect(await storedBaseUrl()).toBe(before)
    expect(app.config.baseUrl).toBe(originalBaseUrl)
  })

  it('tests, saves and re-registers a reachable address', async () => {
    const res = await putConfig({ baseUrl: 'http://new-host' })

    expect(res.statusCode).toBe(200)
    const body = res.json<ConfigResponse>()
    expect(await storedBaseUrl()).toBe('http://new-host')
    for (const arr of ARRS) {
      expect(body.webhooks?.[arr]).toEqual([
        expect.objectContaining({ success: true, code: null }),
      ])
      expect(arrWebhookMocks[arr].requests).toEqual([
        { method: 'TEST', name: webhookName(arr) },
        { method: 'POST', name: webhookName(arr) },
        { method: 'DELETE', id: 172 },
      ])
      expect(arrWebhookMocks[arr].hooks.map((hook) => hook.name)).toEqual([
        webhookName(arr),
      ])
    }
  })

  it('treats a port change as an address change', async () => {
    const res = await putConfig({ baseUrl: originalBaseUrl, port: 4004 })

    expect(res.statusCode).toBe(200)
    const body = res.json<ConfigResponse>()
    expect(app.config.port).toBe(4004)
    for (const arr of ARRS) {
      expect(body.webhooks?.[arr]).toEqual([
        expect.objectContaining({ success: true, code: null }),
      ])
      expect(arrWebhookMocks[arr].requests).toEqual([
        { method: 'TEST', name: webhookName(arr) },
        { method: 'POST', name: webhookName(arr) },
        { method: 'DELETE', id: 172 },
      ])
      expect(arrWebhookMocks[arr].hooks.map((hook) => hook.name)).toEqual([
        webhookName(arr),
      ])
    }
  })

  it('saves the address when an arr is down', async () => {
    server.use(
      http.get('http://test-sonarr:8989/api/v3/notification', () =>
        HttpResponse.error(),
      ),
    )

    const res = await putConfig({ baseUrl: 'http://new-host' })

    expect(res.statusCode).toBe(200)
    const body = res.json<ConfigResponse>()
    expect(body.webhooks?.sonarr).toEqual([
      expect.objectContaining({ success: false, code: 'unreachable' }),
    ])
    expect(body.webhooks?.radarr).toEqual([
      expect.objectContaining({ success: true, code: null }),
    ])
    expect(await storedBaseUrl()).toBe('http://new-host')
  })

  it('skips placeholder instances', async () => {
    const knex = getTestDatabase()
    for (const table of ['radarr_instances', 'sonarr_instances']) {
      await knex(table).update({ api_key: ARR_API_KEY_PLACEHOLDER })
    }

    const res = await putConfig({ baseUrl: 'http://new-host' })

    expect(res.statusCode).toBe(200)
    expect(res.json<ConfigResponse>().webhooks).toEqual({
      radarr: [],
      sonarr: [],
    })
    for (const arr of ARRS) {
      expect(arrWebhookMocks[arr].requests).toEqual([])
    }
  })
})
