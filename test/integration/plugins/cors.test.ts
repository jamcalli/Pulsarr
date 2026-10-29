import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const LISTED_ORIGIN = 'https://dashboard.example.com'
const UNLISTED_ORIGIN = 'https://other.example.com'

const corsHeaders = (headers: Record<string, unknown>) =>
  Object.keys(headers).filter((name) => name.startsWith('access-control-'))

describe('cors with allowedOrigins', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.allowedOrigins = `${LISTED_ORIGIN}/, https://second.example.com`
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    delete process.env.allowedOrigins
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'requiredExceptLocal'
    app.caches.clear()
  })

  it('parses and normalizes the configured origins', () => {
    expect(app.config.allowedOrigins).toEqual([
      LISTED_ORIGIN,
      'https://second.example.com',
    ])
  })

  it('echoes a listed origin with credentials on a GET', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
      headers: { origin: LISTED_ORIGIN },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(LISTED_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers.vary).toContain('Origin')
  })

  it('lets a POST from a listed origin through', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
      headers: { origin: LISTED_ORIGIN },
      payload: { name: 'from-dashboard' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.headers['access-control-allow-origin']).toBe(LISTED_ORIGIN)
  })

  it('answers a preflight from a listed origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
      headers: {
        origin: LISTED_ORIGIN,
        'access-control-request-method': 'POST',
      },
    })

    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe(LISTED_ORIGIN)
    expect(res.headers['access-control-allow-methods']).toContain('POST')
  })

  it('allows the API key header in a preflight from a listed origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/api-keys/',
      remoteAddress: '8.8.7.1',
      headers: {
        origin: LISTED_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-api-key',
      },
    })

    expect(res.statusCode).toBe(204)
    expect(
      String(res.headers['access-control-allow-headers'])
        .toLowerCase()
        .split(', '),
    ).toContain('x-api-key')
  })

  it('accepts a valid API key from a listed origin', async () => {
    const { key } = await app.apiKeys.createApiKey({ name: 'dashboard' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: '8.8.7.2',
      headers: { origin: LISTED_ORIGIN, 'x-api-key': key },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(LISTED_ORIGIN)
  })

  it('rejects an invalid API key from a listed origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: '8.8.7.3',
      headers: { origin: LISTED_ORIGIN, 'x-api-key': 'not-a-key' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('sends no CORS headers to an unlisted origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
      headers: { origin: UNLISTED_ORIGIN },
    })

    expect(res.statusCode).toBe(200)
    expect(corsHeaders(res.headers)).toEqual([])
  })

  it('rejects a POST from an unlisted origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
      headers: { origin: UNLISTED_ORIGIN },
      payload: { name: 'from-elsewhere' },
    })

    expect(res.statusCode).toBe(403)
    expect(corsHeaders(res.headers)).toEqual([])
  })

  it('sends no CORS headers to a request without an origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/api-keys/',
      remoteAddress: '127.0.0.1',
    })

    expect(res.statusCode).toBe(200)
    expect(corsHeaders(res.headers)).toEqual([])
  })
})
