import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedConfig } from '../../helpers/seeds/config.js'

// Cases use distinct IPs because the limiter keys on req.ip and its store
// lives for the lifetime of the app instance
const hit = (
  app: FastifyInstance,
  url: string,
  ip: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  headers: Record<string, string> = {},
) => app.inject({ method, url, remoteAddress: ip, headers })

const statusesFor = async (
  app: FastifyInstance,
  url: string,
  ip: string,
  count: number,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  headers: Record<string, string> = {},
) => {
  const codes: number[] = []
  for (let i = 0; i < count; i++) {
    const res = await hit(app, url, ip, method, headers)
    codes.push(res.statusCode)
  }
  return codes
}

const ADMIN = {
  email: 'ratelimit@test.local',
  username: 'ratelimitAdmin',
  password: 'sup3rsecret',
}

// A real cookie session, not the auth-disabled bypass: bypass builds its session
// inside autohooks, which never runs for unmatched paths
let signInCount = 0
const signIn = async (app: FastifyInstance) => {
  signInCount += 1
  const setupIp = `10.99.0.${signInCount}`
  await app.inject({
    method: 'POST',
    url: '/v1/users/create-admin',
    remoteAddress: setupIp,
    payload: ADMIN,
  })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/users/login',
    remoteAddress: setupIp,
    payload: { login: ADMIN.email, password: ADMIN.password },
  })
  const cookie = res.cookies[0]
  if (!cookie) {
    throw new Error(`login failed: ${res.statusCode} ${res.body}`)
  }
  return `${cookie.name}=${cookie.value}`
}

describe('Rate limiting', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    // Rate limiting only applies to unauthenticated traffic, so auth must be on
    app.config.authenticationMethod = 'required'
  })

  describe('unauthenticated /v1 requests', () => {
    // Replying 401 from the auth hook skips the route-level limiter, so these
    // requests used to be counted by nothing at all
    it('counts failed auth against the configured global limit', async () => {
      const max = String(app.config.rateLimitMax)
      const first = await hit(app, '/v1/config', '10.10.0.1')
      const second = await hit(app, '/v1/config', '10.10.0.1')

      expect(first.statusCode).toBe(401)
      expect(first.headers['x-ratelimit-limit']).toBe(max)
      expect(second.headers['x-ratelimit-remaining']).toBe(
        String(app.config.rateLimitMax - 2),
      )
    })

    it('counts invalid API keys against the same bucket', async () => {
      const res = await hit(app, '/v1/config', '10.10.0.2', 'GET', {
        'x-api-key': 'not-a-real-key',
      })

      expect(res.statusCode).toBe(401)
      expect(res.headers['x-ratelimit-limit']).toBe(
        String(app.config.rateLimitMax),
      )
    })

    it('counts authenticated and unauthenticated traffic in one bucket', async () => {
      const cookie = await signIn(app)
      const ip = '10.10.0.3'

      const unauthenticated = await hit(app, '/v1/config', ip)
      const authenticated = await hit(app, '/v1/config', ip, 'GET', { cookie })

      expect(unauthenticated.statusCode).toBe(401)
      expect(authenticated.statusCode).toBe(200)
      expect(authenticated.headers['x-ratelimit-limit']).toBe(
        String(app.config.rateLimitMax),
      )
      // The 401 must have consumed from the same bucket the 200 reports on
      expect(
        Number(authenticated.headers['x-ratelimit-remaining']),
      ).toBeLessThan(Number(unauthenticated.headers['x-ratelimit-remaining']))
    })

    // A single prefix would otherwise get one bucket per address
    it('collapses IPv6 addresses to their /64', async () => {
      const first = await hit(app, '/v1/config', '2001:db8:1:1::1')
      const sameSubnet = await hit(app, '/v1/config', '2001:db8:1:1::2')
      const otherSubnet = await hit(app, '/v1/config', '2001:db8:1:2::1')

      expect(first.headers['x-ratelimit-remaining']).toBe(
        String(app.config.rateLimitMax - 1),
      )
      expect(sameSubnet.headers['x-ratelimit-remaining']).toBe(
        String(app.config.rateLimitMax - 2),
      )
      expect(otherSubnet.headers['x-ratelimit-remaining']).toBe(
        String(app.config.rateLimitMax - 1),
      )
    })

    it('treats IPv4-mapped IPv6 as the same bucket as plain IPv4', async () => {
      const mapped = await hit(app, '/v1/config', '::ffff:10.10.0.8')
      const plain = await hit(app, '/v1/config', '10.10.0.8')

      expect(mapped.headers['x-ratelimit-remaining']).toBe(
        String(app.config.rateLimitMax - 1),
      )
      expect(plain.headers['x-ratelimit-remaining']).toBe(
        String(app.config.rateLimitMax - 2),
      )
    })

    it('eventually returns 429 rather than 401', async () => {
      const codes = await statusesFor(
        app,
        '/v1/config',
        '10.10.0.4',
        app.config.rateLimitMax + 2,
      )

      expect(
        codes.slice(0, app.config.rateLimitMax).every((c) => c === 401),
      ).toBe(true)
      expect(codes[app.config.rateLimitMax]).toBe(429)
      expect(codes.at(-1)).toBe(429)
    })
  })

  describe('credential endpoints', () => {
    it('limits login after 5 attempts', async () => {
      const codes = await statusesFor(
        app,
        '/v1/users/login',
        '10.10.0.5',
        7,
        'POST',
      )

      expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true)
      expect(codes[5]).toBe(429)
      expect(codes[6]).toBe(429)
    })

    // Only reachable once authenticated, so the tighter bucket only applies
    // there - an anonymous caller is rejected by the auth hook first
    it('limits password changes after 5 attempts', async () => {
      const cookie = await signIn(app)
      const codes = await statusesFor(
        app,
        '/v1/users/update-password',
        '10.10.0.9',
        7,
        'PUT',
        { cookie },
      )

      expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true)
      expect(codes[5]).toBe(429)
      expect(codes[6]).toBe(429)
    })

    it('limits create-admin after 5 attempts', async () => {
      const codes = await statusesFor(
        app,
        '/v1/users/create-admin',
        '10.10.0.5',
        7,
        'POST',
      )

      expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true)
      expect(codes[5]).toBe(429)
    })
  })

  describe('incoming webhooks', () => {
    const payload = { instanceName: 'Radarr', eventType: 'Test' }

    const post = (ip: string, secret?: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        remoteAddress: ip,
        headers: secret ? { 'x-pulsarr-secret': secret } : {},
        payload,
      })

    it('does not limit requests carrying a valid secret', async () => {
      const secret = app.config.webhookSecret
      const codes: number[] = []
      for (let i = 0; i < 25; i++) {
        codes.push((await post('10.11.0.1', secret)).statusCode)
      }

      expect(codes.some((c) => c === 429)).toBe(false)
    })

    it('limits requests with an invalid secret', async () => {
      const codes: number[] = []
      for (let i = 0; i < 12; i++) {
        codes.push((await post('10.11.0.2', 'wrong-secret')).statusCode)
      }

      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
      expect(codes[10]).toBe(429)
      expect(codes[11]).toBe(429)
    })

    it('limits requests with no secret at all', async () => {
      const codes: number[] = []
      for (let i = 0; i < 12; i++) {
        codes.push((await post('10.11.0.3')).statusCode)
      }

      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
      expect(codes[10]).toBe(429)
    })
  })

  describe('unmatched paths', () => {
    // GET falls through the SPA catch-all, which is a real route and so is
    // already counted by the global limiter. Only non-GET reaches the
    // not-found handler's own preHandler.
    it('limits 404 probing after 10 attempts', async () => {
      const codes = await statusesFor(
        app,
        '/no-such-route',
        '10.10.0.6',
        12,
        'POST',
      )

      expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true)
      expect(codes[10]).toBe(429)
      expect(codes[11]).toBe(429)
    })

    it('rejects unmatched /v1 paths as unauthenticated, not 404', async () => {
      const res = await hit(app, '/v1/no-such-route', '10.10.0.8')

      expect(res.statusCode).toBe(401)
    })
  })

  describe('429 response shape', () => {
    it('matches the shared Error schema', async () => {
      await statusesFor(app, '/v1/users/login', '10.10.0.7', 5, 'POST')
      const res = await hit(app, '/v1/users/login', '10.10.0.7', 'POST')

      expect(res.statusCode).toBe(429)
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: expect.stringContaining('Rate limit exceeded'),
      })
    })
  })
})
