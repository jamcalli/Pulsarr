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
import { seedAll } from '../../helpers/seeds/index.js'

describe('Config _isReady persistence', () => {
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
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
  })

  it('persists _isReady: false via PUT /v1/config', async () => {
    // The boot auto-start latch must not fire on runtime config writes
    app.watchlistWorkflow.startWorkflow = vi.fn().mockResolvedValue(undefined)

    const enableRes = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { _isReady: true },
    })
    expect(enableRes.statusCode).toBe(200)
    expect(app.config._isReady).toBe(true)

    const putRes = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { _isReady: false },
    })
    expect(putRes.statusCode).toBe(200)

    const getRes = await app.inject({
      method: 'GET',
      url: '/v1/config',
    })
    expect(getRes.statusCode).toBe(200)
    const body = getRes.json() as { config: { _isReady: boolean } }
    expect(body.config._isReady).toBe(false)
    expect(app.config._isReady).toBe(false)

    const knex = getTestDatabase()
    const row = await knex('configs').where({ id: 1 }).first()
    expect(row).toBeDefined()
    expect(Boolean(row?._isReady)).toBe(false)
    expect(app.watchlistWorkflow.startWorkflow).not.toHaveBeenCalled()
  })

  it('persists _isReady: false when starting with autoStart: false', async () => {
    const enableRes = await app.inject({
      method: 'PUT',
      url: '/v1/config',
      payload: { _isReady: true },
    })
    expect(enableRes.statusCode).toBe(200)
    expect(app.config._isReady).toBe(true)

    app.watchlistWorkflow.getStatus = vi.fn().mockReturnValue('stopped')
    app.watchlistWorkflow.startWorkflow = vi.fn().mockResolvedValue(undefined)

    const startRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-workflow/start',
      payload: { autoStart: false },
    })
    expect(startRes.statusCode).toBe(200)
    expect(app.watchlistWorkflow.startWorkflow).toHaveBeenCalledTimes(1)
    expect(app.config._isReady).toBe(false)

    const knex = getTestDatabase()
    const row = await knex('configs').where({ id: 1 }).first()
    expect(row).toBeDefined()
    expect(Boolean(row?._isReady)).toBe(false)
  })
})
