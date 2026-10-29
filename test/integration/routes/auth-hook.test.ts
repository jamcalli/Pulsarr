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

const FOREIGN_ORIGIN = 'https://other.example.com'
const LAN_HOST = '192.168.1.10:3003'
const LAN_CLIENT = '192.168.1.20'
const TRUSTED_PROXY = '10.0.0.2'
const ADMIN_LOGIN = {
  login: 'testadmin@example.com',
  password: 'auth-hook-password',
}
const AUTH_MODES = ['required', 'requiredExceptLocal', 'disabled'] as const

const corsHeaders = (headers: Record<string, unknown>) =>
  Object.keys(headers).filter((name) => name.startsWith('access-control-'))

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

  const login = async (remoteAddress: string) => {
    await getTestDatabase()('admin_users')
      .where({ email: ADMIN_LOGIN.login })
      .update({ password: await app.hash(ADMIN_LOGIN.password) })
    return app.inject({
      method: 'POST',
      url: '/v1/users/login',
      remoteAddress,
      payload: ADMIN_LOGIN,
    })
  }

  const signIn = async (remoteAddress: string) => {
    const res = await login(remoteAddress)
    const cookie = res.cookies[0]
    if (!cookie) {
      throw new Error(`login failed: ${res.statusCode} ${res.body}`)
    }
    return `${cookie.name}=${cookie.value}`
  }

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'required'
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

  describe('request origin', () => {
    it.each(AUTH_MODES)(
      'rejects a POST from an unlisted origin under %s',
      async (mode) => {
        app.config.authenticationMethod = mode

        const res = await app.inject({
          method: 'POST',
          url: '/v1/api-keys/',
          remoteAddress: '127.0.0.1',
          headers: { host: LAN_HOST, origin: FOREIGN_ORIGIN },
          payload: { name: 'origin-check' },
        })

        expect(res.statusCode).toBe(403)
        expect(res.headers['x-ratelimit-limit']).toBeDefined()
      },
    )

    it('rejects a signed-in POST from an unlisted origin', async () => {
      const cookie = await signIn('8.8.6.1')

      const res = await app.inject({
        method: 'POST',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.1',
        headers: { cookie, host: LAN_HOST, origin: FOREIGN_ORIGIN },
        payload: { name: 'origin-check' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('rejects a POST to a public route from an unlisted origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/users/login',
        remoteAddress: '8.8.6.2',
        headers: { host: LAN_HOST, origin: FOREIGN_ORIGIN },
        payload: ADMIN_LOGIN,
      })

      expect(res.statusCode).toBe(403)
    })

    it.each([
      ['a same-host origin', { origin: `http://${LAN_HOST}` }],
      ['no origin', {}],
      [
        'sec-fetch-site same-origin with a different host',
        {
          origin: 'https://pulsarr.example.com',
          'sec-fetch-site': 'same-origin',
        },
      ],
    ])('lets a signed-in POST with %s through', async (_label, headers) => {
      const cookie = await signIn('8.8.6.3')

      const res = await app.inject({
        method: 'POST',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.3',
        headers: { cookie, host: LAN_HOST, ...headers },
        payload: { name: 'origin-check' },
      })

      expect(res.statusCode).toBe(201)
    })

    it('answers a GET from an unlisted origin without CORS headers', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'

      const res = await app.inject({
        method: 'GET',
        url: '/v1/api-keys/',
        remoteAddress: '127.0.0.1',
        headers: { host: LAN_HOST, origin: FOREIGN_ORIGIN },
      })

      expect(res.statusCode).toBe(200)
      expect(corsHeaders(res.headers)).toEqual([])
    })

    it('answers a preflight without CORS headers when no origins are listed', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.4',
        headers: {
          origin: FOREIGN_ORIGIN,
          'access-control-request-method': 'POST',
        },
      })

      expect(corsHeaders(res.headers)).toEqual([])
    })
  })

  describe('local access modes', () => {
    const cases = (['requiredExceptLocal', 'disabled'] as const).flatMap(
      (mode) =>
        ['127.0.0.1', LAN_CLIENT].flatMap((address) =>
          [undefined, `http://${LAN_HOST}`].flatMap((origin) =>
            (['GET', 'POST'] as const).map((method) => ({
              mode,
              address,
              origin,
              method,
            })),
          ),
        ),
    )

    it.each(cases)(
      '$mode lets $method from $address with origin $origin through',
      async ({ mode, address, origin, method }) => {
        app.config.authenticationMethod = mode

        const res = await app.inject({
          method,
          url: '/v1/api-keys/',
          remoteAddress: address,
          headers: origin ? { host: LAN_HOST, origin } : { host: LAN_HOST },
          ...(method === 'POST' ? { payload: { name: 'local-access' } } : {}),
        })

        expect(res.statusCode).toBe(method === 'POST' ? 201 : 200)
      },
    )

    it('opens the progress stream for a LAN client', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'

      const res = await app.inject({
        method: 'GET',
        url: '/v1/progress',
        remoteAddress: LAN_CLIENT,
        payloadAsStream: true,
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/event-stream')
      res.stream().destroy()
    })

    it('keeps the local rule for a LAN client behind a trusted proxy', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'

      const res = await app.inject({
        method: 'POST',
        url: '/v1/api-keys/',
        remoteAddress: TRUSTED_PROXY,
        headers: { 'x-forwarded-for': LAN_CLIENT },
        payload: { name: 'proxied' },
      })

      expect(res.statusCode).toBe(201)
    })

    it('rejects a public client behind a trusted proxy', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'

      const res = await app.inject({
        method: 'GET',
        url: '/v1/api-keys/',
        remoteAddress: TRUSTED_PROXY,
        headers: { 'x-forwarded-for': '8.8.6.5' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('rejects x-forwarded-for from an untrusted peer', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'

      const res = await app.inject({
        method: 'GET',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.6',
        headers: { 'x-forwarded-for': LAN_CLIENT },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('api keys', () => {
    it('decides a foreign-origin request with a valid key by the key', async () => {
      const { key } = await app.apiKeys.createApiKey({ name: 'foreign' })

      const res = await app.inject({
        method: 'POST',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.7',
        headers: { 'x-api-key': key, origin: FOREIGN_ORIGIN },
        payload: { name: 'created-by-key' },
      })

      expect(res.statusCode).toBe(201)
    })

    it('rejects a foreign-origin request with an invalid key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.8',
        headers: { 'x-api-key': 'not-a-key', origin: FOREIGN_ORIGIN },
        payload: { name: 'created-by-key' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('rejects an invalid key on a public route', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/users/login',
        remoteAddress: '8.8.6.10',
        headers: { 'x-api-key': 'not-a-key', origin: FOREIGN_ORIGIN },
        payload: ADMIN_LOGIN,
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ message: 'Invalid API key' })
    })

    it('rejects an invalid key from a local address under requiredExceptLocal', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'

      const res = await app.inject({
        method: 'GET',
        url: '/v1/api-keys/',
        remoteAddress: '127.0.0.1',
        headers: { 'x-api-key': 'not-a-key' },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ message: 'Invalid API key' })
    })
  })

  describe('login session', () => {
    const listKeys = (cookie: string) =>
      app.inject({
        method: 'GET',
        url: '/v1/api-keys/',
        remoteAddress: '8.8.6.11',
        headers: { cookie },
      })

    it('issues a new session id on login and ends the one it replaces', async () => {
      const before = await signIn('8.8.6.11')
      const res = await app.inject({
        method: 'POST',
        url: '/v1/users/login',
        remoteAddress: '8.8.6.11',
        headers: { cookie: before },
        payload: ADMIN_LOGIN,
      })
      const cookie = res.cookies.at(-1)
      const after = cookie ? `${cookie.name}=${cookie.value}` : ''

      expect(res.statusCode).toBe(200)
      expect(after).not.toBe('')
      expect(after).not.toBe(before)
      expect((await listKeys(before)).statusCode).toBe(401)
      expect((await listKeys(after)).statusCode).toBe(200)
    })
  })

  it('sets the session cookie with SameSite=Lax', async () => {
    const res = await login('8.8.6.9')

    expect(res.statusCode).toBe(200)
    expect(String(res.headers['set-cookie'])).toContain('SameSite=Lax')
  })
})
