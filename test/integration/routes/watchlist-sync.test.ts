import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
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
import { createDeferred } from '../../helpers/deferred.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const SELF_WATCHLIST_URL =
  'https://discover.provider.plex.tv/library/sections/watchlist/all'

describe('Plex watchlist sync start and status routes', () => {
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
    app.config.plexTokens = ['test_plex_token_1234567890']
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const start = (type: string) =>
    app.inject({ method: 'POST', url: `/v1/plex/watchlist-sync/${type}/start` })

  const status = async (type: string) =>
    (
      await app.inject({
        method: 'GET',
        url: `/v1/plex/watchlist-sync/${type}/status`,
      })
    ).json()

  function holdSelfWatchlist() {
    const gate = createDeferred<void>()
    server.use(
      http.get(SELF_WATCHLIST_URL, async () => {
        await gate.promise
        return HttpResponse.json({
          MediaContainer: { Metadata: [], totalSize: 0 },
        })
      }),
    )
    return gate
  }

  it('returns 202, reads running, then done with the item count', async () => {
    const gate = holdSelfWatchlist()

    const res = await start('self-watchlist')

    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ message: 'Watchlist sync started' })
    expect(await status('self-watchlist')).toMatchObject({
      state: 'running',
      finishedAt: null,
      error: null,
    })

    gate.resolve()
    await vi.waitFor(async () =>
      expect(await status('self-watchlist')).toMatchObject({
        state: 'done',
        error: null,
        total: 0,
        friends: null,
      }),
    )
  })

  it('joins a sync already running instead of refusing it', async () => {
    const gate = holdSelfWatchlist()

    expect((await start('self-watchlist')).statusCode).toBe(202)
    expect((await start('self-watchlist')).statusCode).toBe(202)
    const { startedAt } = await status('self-watchlist')

    gate.resolve()
    await vi.waitFor(async () =>
      expect(await status('self-watchlist')).toMatchObject({
        state: 'done',
        startedAt,
      }),
    )
  })

  it('reads failed with the message when the sync throws', async () => {
    app.config.plexTokens = []

    expect((await start('others-watchlist')).statusCode).toBe(202)

    await vi.waitFor(async () =>
      expect(await status('others-watchlist')).toMatchObject({
        state: 'failed',
        error: 'No Plex token configured',
        total: null,
        friends: null,
      }),
    )
  })

  it('refuses a start while the workflow is starting', async () => {
    vi.spyOn(app.watchlistWorkflow, 'getStatus').mockReturnValue('starting')
    const sync = vi.spyOn(app.plexWatchlist, 'getSelfWatchlist')

    const res = await start('self-watchlist')

    expect(res.statusCode).toBe(409)
    expect(sync).not.toHaveBeenCalled()
  })

  it('rejects an unknown sync type', async () => {
    expect((await start('everyone')).statusCode).toBe(400)
  })
})
