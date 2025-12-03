import type { HealthCheckResponse } from '@schemas/health/health.schema.js'
import { describe, expect, it, vi } from 'vitest'
import { build } from '../../helpers/app.js'

describe('Health Endpoint', () => {
  it('should return 200 and healthy status when app is healthy', async (ctx) => {
    const app = await build(ctx)

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(200)

    const body = response.json<HealthCheckResponse>()
    expect(body.status).toBe('healthy')
    expect(body.checks.database).toBe('ok')
    expect(body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
  })

  it('should not require authentication', async (ctx) => {
    const app = await build(ctx)

    // Request without session or API key
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    // Should succeed (not 401 Unauthorized)
    expect(response.statusCode).toBe(200)
    const body = response.json<HealthCheckResponse>()
    expect(body.status).toBe('healthy')
  })

  it('should return 503 when database is unavailable', async (ctx) => {
    const app = await build(ctx)

    // Mock the database method to simulate connection failure
    const spy = vi
      .spyOn(app.db.knex, 'raw')
      .mockRejectedValue(new Error('Database connection failed'))

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    })

    expect(response.statusCode).toBe(503)

    const body = response.json<HealthCheckResponse>()
    expect(body.status).toBe('unhealthy')
    expect(body.checks.database).toBe('failed')
    expect(body.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )

    // Restore the spy
    spy.mockRestore()
  })
})
