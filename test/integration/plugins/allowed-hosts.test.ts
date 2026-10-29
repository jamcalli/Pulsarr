import { connect } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const health = (app: FastifyInstance, host: string) =>
  app.inject({ method: 'GET', url: '/health', headers: { host } })

describe('allowed hosts', () => {
  describe('when unset', () => {
    let app: FastifyInstance

    beforeAll(async () => {
      app = await build()
      await app.ready()
    })

    afterAll(async () => {
      await app.close()
    })

    it('accepts any host', async () => {
      const res = await health(app, 'anything.example.com:3003')

      expect(res.statusCode).toBe(200)
    })
  })

  describe('when set', () => {
    let app: FastifyInstance
    let port: number

    beforeAll(async () => {
      process.env.allowedHosts = 'pulsarr.example.com'
      app = await build()
      const address = await app.listen({ port: 0, host: '127.0.0.1' })
      port = Number(new URL(address).port)
    })

    afterAll(async () => {
      await app.close()
      delete process.env.allowedHosts
    })

    beforeEach(async () => {
      await resetDatabase()
      await seedAll(getTestDatabase())
      app.config.authenticationMethod = 'required'
      app.caches.clear()
    })

    it.each([
      'pulsarr.example.com',
      'Pulsarr.Example.com:3003',
      'localhost:3003',
      '127.0.0.1:3003',
      '[::1]:3003',
    ])('accepts %s', async (host) => {
      const res = await health(app, host)

      expect(res.statusCode).toBe(200)
    })

    it('rejects an unlisted host on every route', async () => {
      const healthRes = await health(app, 'other.example.com')
      const apiRes = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        headers: { host: 'other.example.com' },
        payload: {},
      })

      expect(healthRes.statusCode).toBe(400)
      expect(apiRes.statusCode).toBe(400)
      expect(apiRes.json()).toMatchObject({ message: 'Host not allowed' })
    })

    it.each([
      ['a missing Host', 'GET /health HTTP/1.0\r\n\r\n'],
      [
        'an empty Host',
        'GET /health HTTP/1.1\r\nHost:\r\nConnection: close\r\n\r\n',
      ],
    ])('rejects %s', async (_label, rawRequest) => {
      const response = await new Promise<string>((resolve, reject) => {
        let received = ''
        const socket = connect(port, '127.0.0.1', () =>
          socket.write(rawRequest),
        )
        socket.on('data', (chunk) => {
          received += chunk.toString()
        })
        socket.once('end', () => resolve(received))
        socket.once('error', reject)
      })

      expect(response).toMatch(/^HTTP\/1\.[01] 400 /)
      expect(response).toContain('Host not allowed')
    })

    it.each([
      ['an unmatched /v1 path', '/v1/does-not-exist', 404],
      ['an unmatched asset path', '/missing.js', 404],
      ['the SPA catch-all', '/requests', 302],
    ])('applies to %s', async (_label, url, listedStatus) => {
      const request = (host: string) =>
        app.inject({
          method: 'GET',
          url,
          remoteAddress: '8.8.9.1',
          headers: { host, accept: 'text/html' },
        })

      expect((await request('pulsarr.example.com')).statusCode).toBe(
        listedStatus,
      )
      expect((await request('other.example.com')).statusCode).toBe(400)
    })

    it('blocks a same-origin page on an unlisted name from a LAN address under requiredExceptLocal', async () => {
      app.config.authenticationMethod = 'requiredExceptLocal'
      const request = (host: string) =>
        app.inject({
          method: 'POST',
          url: '/v1/api-keys/',
          remoteAddress: '192.168.1.20',
          headers: {
            host,
            origin: `http://${host}`,
            'sec-fetch-site': 'same-origin',
          },
          payload: { name: 'same-origin-page' },
        })

      expect((await request('other.example.com:3003')).statusCode).toBe(400)
      expect((await request('pulsarr.example.com:3003')).statusCode).toBe(201)
    })

    it('rejects an unlisted Host even when a trusted peer forwards a listed one', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: '192.168.1.20',
        headers: { host: 'other.example.com', 'x-forwarded-host': 'localhost' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('rejects a listed Host when a trusted peer forwards an unlisted one', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: '192.168.1.20',
        headers: {
          host: 'pulsarr.example.com',
          'x-forwarded-host': 'other.example.com',
        },
      })

      expect(res.statusCode).toBe(400)
    })

    it('accepts a listed Host forwarded by a trusted peer', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: '192.168.1.20',
        headers: {
          host: 'pulsarr.example.com',
          'x-forwarded-host': 'pulsarr.example.com',
        },
      })

      expect(res.statusCode).toBe(200)
    })
  })
})
