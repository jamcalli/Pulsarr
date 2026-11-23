import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

const PROXY_PEER = '172.18.0.2'
const CLIENT_IP_ROUTE = '/test/client-ip'

describe('trusted proxies', () => {
  describe('with a listed public range', () => {
    let app: FastifyInstance

    const apiKeys = (forwardedFor: string) =>
      app.inject({
        method: 'GET',
        url: '/v1/api-keys/',
        remoteAddress: PROXY_PEER,
        headers: { 'x-forwarded-for': forwardedFor },
      })

    const clientIp = async (forwardedFor: string) => {
      const res = await app.inject({
        method: 'GET',
        url: CLIENT_IP_ROUTE,
        remoteAddress: PROXY_PEER,
        headers: { 'x-forwarded-for': forwardedFor },
      })
      return res.body
    }

    beforeAll(async () => {
      process.env.trustedProxies = '173.245.48.0/20'
      app = await build()
      app.get(CLIENT_IP_ROUTE, async (request) => request.ip)
      await app.ready()
    })

    afterAll(async () => {
      await app.close()
      delete process.env.trustedProxies
    })

    beforeEach(async () => {
      await resetDatabase()
      await seedAll(getTestDatabase())
      app.config.authenticationMethod = 'requiredExceptLocal'
      app.caches.clear()
    })

    it('parses the configured ranges', () => {
      expect(app.config.trustedProxies).toEqual(['173.245.48.0/20'])
    })

    it('keeps the local bypass for a LAN client behind a local proxy', async () => {
      const res = await apiKeys('192.168.1.50')

      expect(res.statusCode).toBe(200)
    })

    it('refuses a forged local address sent through the listed range', async () => {
      const res = await apiKeys('10.0.0.1, 173.245.48.5')

      expect(res.statusCode).toBe(401)
    })

    it('refuses a public visitor sent through the listed range', async () => {
      const res = await apiKeys('203.0.113.7, 173.245.48.5')

      expect(res.statusCode).toBe(401)
    })

    it('walks past a listed edge address to the visitor', async () => {
      expect(await clientIp('203.0.113.7, 173.245.48.5')).toBe('203.0.113.7')
    })

    it('stops at an edge address outside the listed range', async () => {
      expect(await clientIp('203.0.113.7, 198.51.100.9')).toBe('198.51.100.9')
    })
  })

  describe('with an invalid range', () => {
    afterAll(() => {
      delete process.env.trustedProxies
    })

    it('refuses to boot on a catch-all range', async () => {
      process.env.trustedProxies = '0.0.0.0/0'

      await expect(build()).rejects.toThrow(/trustedProxies/)
    })
  })
})
