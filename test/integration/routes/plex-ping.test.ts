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

describe('GET /v1/plex/ping', () => {
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

  it('succeeds when Plex accepts the token', async () => {
    vi.spyOn(app.plexWatchlist, 'pingPlex').mockResolvedValue('accepted')

    const res = await app.inject({ method: 'GET', url: '/v1/plex/ping' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ success: true })
  })

  it('fails when Plex rejects the token', async () => {
    vi.spyOn(app.plexWatchlist, 'pingPlex').mockResolvedValue('rejected')

    const res = await app.inject({ method: 'GET', url: '/v1/plex/ping' })

    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({
      message: 'Plex did not accept the token',
    })
  })

  it('fails with a bad gateway when Plex cannot be reached', async () => {
    vi.spyOn(app.plexWatchlist, 'pingPlex').mockResolvedValue('unreachable')

    const res = await app.inject({ method: 'GET', url: '/v1/plex/ping' })

    expect(res.statusCode).toBe(502)
  })
})
