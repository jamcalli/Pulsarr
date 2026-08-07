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
  method: 'GET' | 'POST' = 'GET',
  headers: Record<string, string> = {},
) => app.inject({ method, url, remoteAddress: ip, headers })

const statusesFor = async (
  app: FastifyInstance,
  url: string,
  ip: string,
  count: number,
  method: 'GET' | 'POST' = 'GET',
  headers: Record<string, string> = {},
) => {
  const codes: number[] = []
  for (let i = 0; i < count; i++) {
    const res = await hit(app, url, ip, method, headers)
    codes.push(res.statusCode)
  }
  return codes
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
    it('limits after 20 rejections and returns 429 rather than 401', async () => {
      const codes = await statusesFor(app, '/v1/users', '10.10.0.1', 22)

      expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true)
      expect(codes[20]).toBe(429)
      expect(codes[21]).toBe(429)
    })

    it('limits invalid API keys on the same bucket', async () => {
      const codes = await statusesFor(
        app,
        '/v1/users',
        '10.10.0.2',
        22,
        'GET',
        {
          'x-api-key': 'not-a-real-key',
        },
      )

      expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true)
      expect(codes[20]).toBe(429)
    })

    it('does not limit authenticated traffic', async () => {
      app.config.authenticationMethod = 'disabled'
      const codes = await statusesFor(app, '/v1/users', '10.10.0.3', 30)

      expect(codes.some((c) => c === 429)).toBe(false)
    })
  })

  describe('public credential endpoints', () => {
    it('limits login after 5 attempts', async () => {
      const codes = await statusesFor(
        app,
        '/v1/users/login',
        '10.10.0.4',
        7,
        'POST',
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
      await statusesFor(app, '/v1/users', '10.10.0.7', 21)
      const res = await hit(app, '/v1/users', '10.10.0.7')

      expect(res.statusCode).toBe(429)
      expect(JSON.parse(res.body)).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        message: expect.stringContaining('Rate limit exceeded'),
      })
    })
  })
})
