import type { FastifyInstance, HTTPMethods, RouteOptions } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const PUBLIC_IP = '8.8.8.8'

const PUBLIC_ROUTES = [
  'POST /v1/notifications/webhook',
  'POST /v1/notifications/webhook/maintainerr',
  'POST /v1/users/create-admin',
  'POST /v1/users/login',
]

const routeKey = (method: string, url: string) => `${method} ${url}`

// The limiter keys on req.ip, so every request gets its own address to stay under the global max
const addressFor = (i: number) => `8.8.${Math.floor(i / 250)}.${(i % 250) + 1}`

describe('auth hook', () => {
  let app: FastifyInstance
  const v1Routes: RouteOptions[] = []

  beforeAll(async () => {
    app = await build(undefined, (route) => {
      if (route.url.startsWith('/v1')) {
        v1Routes.push(route)
      }
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'required'
    app.caches.clear()
  })

  it('marks only the known routes as public', () => {
    const publicRoutes = v1Routes
      .filter((route) => route.config?.public === true)
      .flatMap((route) =>
        [route.method].flat().map((method) => routeKey(method, route.url)),
      )
      .sort()

    expect(publicRoutes).toEqual(PUBLIC_ROUTES)
  })

  it('rejects and counts anonymous requests to every protected /v1 route', async () => {
    const requests = v1Routes
      .filter((route) => route.config?.public !== true)
      .flatMap((route) =>
        [route.method].flat().map((method) => ({
          method: method as HTTPMethods,
          url: route.url.replace(/:[^/]+|\*/g, '1'),
        })),
      )

    expect(requests.length).toBeGreaterThan(0)

    const failures: string[] = []
    for (const [i, { method, url }] of requests.entries()) {
      const res = await app.inject({
        method,
        url,
        remoteAddress: addressFor(i),
      })
      if (res.statusCode !== 401 || !res.headers['x-ratelimit-limit']) {
        failures.push(`${routeKey(method, url)} -> ${res.statusCode}`)
      }
    }

    expect(failures).toEqual([])
  })

  it.each(
    [
      '/v1/notifications/webhook',
      '/v1/users/create-admin',
      '/v1/users/login',
    ].map((url, i) => ({ url, ip: `8.8.4.${i + 1}` })),
  )('lets $url reach its handler without a session', async ({ url, ip }) => {
    const res = await app.inject({
      method: 'POST',
      url,
      remoteAddress: ip,
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })

  it('lets the maintainerr webhook reach its handler without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/notifications/webhook/maintainerr',
      remoteAddress: PUBLIC_IP,
      headers: { authorization: app.config.maintainerrWebhookSecret },
      payload: { notification_type: 'TEST_NOTIFICATION' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('rejects a public address under requiredExceptLocal', async () => {
    app.config.authenticationMethod = 'requiredExceptLocal'

    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: PUBLIC_IP,
    })

    expect(res.statusCode).toBe(401)
  })

  it('allows a local address under requiredExceptLocal', async () => {
    app.config.authenticationMethod = 'requiredExceptLocal'

    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
    })

    expect(res.statusCode).toBe(200)
  })

  it('returns 404 for an unmatched /v1 path', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/does-not-exist',
      remoteAddress: PUBLIC_IP,
    })

    expect(res.statusCode).toBe(404)
  })
})
