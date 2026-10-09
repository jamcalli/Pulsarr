import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('Config quota settings validation', () => {
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

  it('rejects retention shorter than the longest quota window', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: {
        quotaSettings: {
          cleanup: { enabled: true, retentionDays: 30 },
          weeklyRolling: { resetDays: 7 },
          monthly: { resetDay: 31, handleMonthEnd: 'skip-month' },
        },
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain(
      'Usage history must be kept for at least 62 days so cleanup never removes requests that still count toward a quota.',
    )
  })

  it('rejects retention shorter than a long weekly rolling window', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: {
        quotaSettings: {
          cleanup: { enabled: true, retentionDays: 90 },
          weeklyRolling: { resetDays: 120 },
          monthly: { resetDay: 1, handleMonthEnd: 'last-day' },
        },
      },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('at least 120 days')
  })

  it('accepts short retention when cleanup is disabled', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: {
        quotaSettings: {
          cleanup: { enabled: false, retentionDays: 1 },
          weeklyRolling: { resetDays: 30 },
          monthly: { resetDay: 1, handleMonthEnd: 'last-day' },
        },
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('accepts retention covering the longest window', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: {
        quotaSettings: {
          cleanup: { enabled: true, retentionDays: 31 },
          weeklyRolling: { resetDays: 14 },
          monthly: { resetDay: 1, handleMonthEnd: 'last-day' },
        },
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it('rejects a partial quota settings payload', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: {
        quotaSettings: {
          monthly: { resetDay: 15, handleMonthEnd: 'last-day' },
        },
      },
    })

    expect(res.statusCode).toBe(400)
  })
})
