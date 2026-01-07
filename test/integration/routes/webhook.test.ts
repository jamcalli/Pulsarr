import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'

describe('Webhook Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('POST /v1/notifications/webhook', () => {
    it('should handle test webhook', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        payload: {
          eventType: 'Test',
          instanceName: 'test-instance',
        },
      })

      expect(res.statusCode).toBe(200)
      const payload = JSON.parse(res.payload)
      expect(payload).toHaveProperty('success')
      expect(payload.success).toBe(true)
    })

    it('should return 400 for invalid payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/webhook',
        payload: {
          invalidField: 'invalid',
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
