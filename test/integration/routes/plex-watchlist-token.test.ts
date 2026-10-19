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

  it('creates one primary owner when both first syncs start together', async () => {
    vi.spyOn(app.watchlistWorkflow, 'getStatus').mockReturnValue('running')
    const db = getTestDatabase()
    await db('users').delete()
    const saved = {
      plexTokens: app.config.plexTokens,
      movie: app.config.newUserDefaultMovieQuotaEnabled,
      show: app.config.newUserDefaultShowQuotaEnabled,
    }
    app.config.plexTokens = ['test_plex_token_1234567890']
    app.config.newUserDefaultMovieQuotaEnabled = true
    app.config.newUserDefaultShowQuotaEnabled = true

    try {
      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/v1/plex/self-watchlist-token' }),
        app.inject({ method: 'GET', url: '/v1/plex/others-watchlist-token' }),
      ])

      expect(responses.map((res) => res.statusCode)).toEqual([200, 200])
      const users = await db('users').select('id', 'is_primary_token')
      const primary = users.filter((user) => Boolean(user.is_primary_token))
      expect(primary).toHaveLength(1)
      const quotas = await db('user_quotas')
        .where('user_id', primary[0]?.id)
        .select('content_type')
      expect(quotas.map((quota) => quota.content_type).sort()).toEqual([
        'movie',
        'show',
      ])
    } finally {
      app.config.plexTokens = saved.plexTokens
      app.config.newUserDefaultMovieQuotaEnabled = saved.movie
      app.config.newUserDefaultShowQuotaEnabled = saved.show
    }
  })
})
