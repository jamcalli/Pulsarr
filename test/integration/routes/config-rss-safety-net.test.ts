import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('Config RSS safety net interval', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
  })

  // createConfig stores env values unvalidated, so the stored interval can sit outside the
  // range PUT accepts; reading the config must still work (the runtime clamps the value)
  it.each([5, 500])(
    'GET /v1/config still answers when the stored interval is %i',
    async (minutes) => {
      await getTestDatabase()('configs')
        .where({ id: 1 })
        .update({ rssSafetyNetIntervalMinutes: minutes })

      const res = await app.inject({ method: 'GET', url: '/v1/config' })

      expect(res.statusCode).toBe(200)
      expect(res.json().config.rssSafetyNetIntervalMinutes).toBe(minutes)
    },
  )

  it('PUT /v1/config still rejects an interval outside 10-120', async () => {
    for (const minutes of [9, 121]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/config',
        payload: { rssSafetyNetIntervalMinutes: minutes },
      })
      expect(res.statusCode).toBe(400)
    }
  })
})
