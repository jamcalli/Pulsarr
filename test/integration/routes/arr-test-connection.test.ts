import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const ARRS = [
  { type: 'sonarr', name: 'Sonarr', baseUrl: 'http://test-sonarr:8989' },
  { type: 'radarr', name: 'Radarr', baseUrl: 'http://test-radarr:7878' },
] as const

const CALLBACK_FAILURE =
  'Unable to send test message: Connection refused (pulsarr:3003)'

describe('arr test connection routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    app.contentRouter.clearRouterRulesCache()
  })

  const serveArr = (arr: (typeof ARRS)[number]) =>
    server.use(
      http.get(`${arr.baseUrl}/api/v3/system/status`, () =>
        HttpResponse.json({
          appName: arr.name,
          version: '4.0.0',
          branch: 'main',
          authentication: 'forms',
        }),
      ),
      http.get(`${arr.baseUrl}/api/v3/notification`, () =>
        HttpResponse.json([]),
      ),
      http.post(`${arr.baseUrl}/api/v3/notification/test`, () =>
        HttpResponse.json('{}'),
      ),
    )

  const testConnection = (arr: (typeof ARRS)[number]) =>
    app.inject({
      method: 'POST',
      url: `/v1/${arr.type}/test-connection`,
      payload: { baseUrl: arr.baseUrl, apiKey: 'unsaved-key' },
    })

  it.each(ARRS)('returns code null when $name passes', async (arr) => {
    serveArr(arr)

    const res = await testConnection(arr)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      code: null,
      message: 'Connection successful and webhook API accessible',
    })
  })

  it.each(ARRS)(
    'returns webhook_callback_failed with the $name message when the notification test fails',
    async (arr) => {
      serveArr(arr)
      server.use(
        http.post(`${arr.baseUrl}/api/v3/notification/test`, () =>
          HttpResponse.json(
            [
              {
                propertyName: 'Url',
                errorMessage: CALLBACK_FAILURE,
                severity: 'error',
              },
            ],
            { status: 400 },
          ),
        ),
      )

      const res = await testConnection(arr)

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        success: false,
        code: 'webhook_callback_failed',
        message: CALLBACK_FAILURE,
      })
    },
  )

  it.each(ARRS)('returns code auth when $name rejects the key', async (arr) => {
    server.use(
      http.get(
        `${arr.baseUrl}/api/v3/system/status`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )

    const res = await testConnection(arr)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ success: false, code: 'auth' })
  })
})
