import { describe, expect, it } from 'vitest'
import { build } from '../../helper.js'

describe('Webhook Routes', () => {
  describe('POST /v1/notifications/webhook', () => {
    it('should handle test webhook', async (ctx) => {
      const app = await build(ctx)

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

    it('should return 400 for invalid payload', async (ctx) => {
      const app = await build(ctx)

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
