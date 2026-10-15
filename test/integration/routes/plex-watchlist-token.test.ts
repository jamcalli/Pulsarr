import type { FastifyInstance } from 'fastify'
import {
  afterAll,
  afterEach,
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

describe('Plex watchlist sync routes', () => {
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['/v1/plex/self-watchlist-token', 'getSelfWatchlist'],
    ['/v1/plex/others-watchlist-token', 'getOthersWatchlists'],
  ] as const)(
    'refuses %s while the workflow is starting',
    async (url, method) => {
      vi.spyOn(app.watchlistWorkflow, 'getStatus').mockReturnValue('starting')
      const sync = vi.spyOn(app.plexWatchlist, method)

      const res = await app.inject({ method: 'GET', url })

      expect(res.statusCode).toBe(409)
      expect(sync).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['/v1/plex/self-watchlist-token', 'getSelfWatchlist'],
    ['/v1/plex/others-watchlist-token', 'getOthersWatchlists'],
  ] as const)('syncs %s once the workflow is running', async (url, method) => {
    vi.spyOn(app.watchlistWorkflow, 'getStatus').mockReturnValue('running')
    const sync = vi
      .spyOn(app.plexWatchlist, method)
      .mockResolvedValue({ total: 0, users: [] })

    const res = await app.inject({ method: 'GET', url })

    expect(res.statusCode).toBe(200)
    expect(sync).toHaveBeenCalledOnce()
  })
})
