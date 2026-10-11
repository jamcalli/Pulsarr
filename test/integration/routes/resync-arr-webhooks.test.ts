import type { WebhookResyncResponse } from '@root/schemas/config/resync-arr-webhooks.schema.js'
import { RadarrService } from '@services/radarr.service.js'
import { SonarrService } from '@services/sonarr.service.js'
import type { FastifyInstance } from 'fastify'
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

const ARRS = ['radarr', 'sonarr'] as const

describe('POST /v1/config/resync-arr-webhooks', () => {
  let app: FastifyInstance
  let originalBaseUrl: string

  const webhookName = (arr: (typeof ARRS)[number]) =>
    (arr === 'radarr'
      ? new RadarrService(app.log, app.config.baseUrl, app.config.port, app)
      : new SonarrService(app.log, app.config.baseUrl, app.config.port, app)
    ).getWebhookName()

  const resync = async (): Promise<WebhookResyncResponse> => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/config/resync-arr-webhooks',
    })
    expect(res.statusCode).toBe(200)
    return res.json<WebhookResyncResponse>()
  }

  beforeAll(async () => {
    app = await build()
    await app.ready()
    originalBaseUrl = app.config.baseUrl
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
    await resync()
    for (const arr of ARRS) {
      resetArrWebhookMock(arr, arrWebhookMocks[arr].hooks)
    }
  })

  afterEach(() => {
    app.config.baseUrl = originalBaseUrl
  })

  it('updates the stored hook in place when the address is unchanged', async () => {
    const body = await resync()

    for (const arr of ARRS) {
      expect(body[arr]).toEqual([expect.objectContaining({ success: true })])
      expect(arrWebhookMocks[arr].requests).toEqual([
        { method: 'PUT', id: 172, name: webhookName(arr) },
      ])
    }
  })

  it('keeps the stored hook when the arr rejects the new callback', async () => {
    const original = Object.fromEntries(
      ARRS.map((arr) => [arr, structuredClone(arrWebhookMocks[arr].hooks)]),
    )
    app.config.baseUrl = 'http://unreachable.invalid'

    const body = await resync()

    for (const arr of ARRS) {
      expect(body[arr]).toEqual([
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('Unable to send test message'),
        }),
      ])
      expect(
        arrWebhookMocks[arr].requests.some((req) => req.method === 'DELETE'),
      ).toBe(false)
      expect(arrWebhookMocks[arr].hooks).toEqual(original[arr])
    }
  })

  it('creates the new hook before removing the old one when the address changes', async () => {
    const oldNames = Object.fromEntries(
      ARRS.map((arr) => [arr, webhookName(arr)]),
    )
    app.config.baseUrl = 'http://new-host'

    const body = await resync()

    for (const arr of ARRS) {
      expect(webhookName(arr)).not.toBe(oldNames[arr])
      expect(body[arr]).toEqual([expect.objectContaining({ success: true })])
      expect(arrWebhookMocks[arr].requests).toEqual([
        { method: 'POST', name: webhookName(arr) },
        { method: 'DELETE', id: 172 },
      ])
      expect(arrWebhookMocks[arr].hooks.map((hook) => hook.name)).toEqual([
        webhookName(arr),
      ])
    }
  })
})
