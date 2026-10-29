import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'

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

    beforeAll(async () => {
      process.env.allowedHosts = 'pulsarr.example.com'
      app = await build()
      await app.ready()
    })

    afterAll(async () => {
      await app.close()
      delete process.env.allowedHosts
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
  })
})
