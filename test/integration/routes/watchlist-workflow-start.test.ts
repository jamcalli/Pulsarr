import type { PlexPingResult } from '@services/plex-watchlist/api/client.js'
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
import { createDeferred } from '../../helpers/deferred.js'
import { seedAll } from '../../helpers/seeds/index.js'

describe('POST /v1/watchlist-workflow/start-background', () => {
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

  afterEach(async () => {
    if (app.watchlistWorkflow.getStatus() !== 'stopped') {
      await app.watchlistWorkflow.stop()
    }
    vi.restoreAllMocks()
  })

  const startInBackground = (autoStart?: boolean) =>
    app.inject({
      method: 'POST',
      url: '/v1/watchlist-workflow/start-background',
      payload: autoStart === undefined ? {} : { autoStart },
    })

  const status = async () =>
    (
      await app.inject({ method: 'GET', url: '/v1/watchlist-workflow/status' })
    ).json()

  function holdPing() {
    const ping = createDeferred<PlexPingResult>()
    vi.spyOn(app.plexWatchlist, 'pingPlex').mockReturnValue(ping.promise)
    return ping
  }

  it('returns 202 at once and reads starting, then 400 while it starts', async () => {
    const ping = holdPing()

    const res = await startInBackground()

    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ message: 'Watchlist workflow is starting' })
    expect(await status()).toMatchObject({
      status: 'starting',
      lastError: null,
    })
    expect((await startInBackground()).statusCode).toBe(400)

    ping.reject(new Error('Plex down'))
    await vi.waitFor(async () =>
      expect((await status()).status).toBe('stopped'),
    )
  })

  it('reads lastError when the start fails and clears it on the next start', async () => {
    const failing = holdPing()

    expect((await startInBackground()).statusCode).toBe(202)
    failing.reject(new Error('Plex down'))

    await vi.waitFor(async () =>
      expect(await status()).toMatchObject({
        status: 'stopped',
        lastError: 'Failed to verify Plex connectivity',
      }),
    )
    expect(app.watchlistWorkflow.statusEvent().metadata).toMatchObject({
      status: 'stopped',
      lastError: 'Failed to verify Plex connectivity',
    })

    const retry = holdPing()
    expect((await startInBackground()).statusCode).toBe(202)
    expect(await status()).toMatchObject({
      status: 'starting',
      lastError: null,
    })

    retry.reject(new Error('Plex down'))
    await vi.waitFor(async () =>
      expect((await status()).status).toBe('stopped'),
    )
  })

  it('saves autoStart as _isReady once the workflow runs', async () => {
    vi.spyOn(app.plexWatchlist, 'pingPlex').mockResolvedValue('accepted')
    vi.spyOn(app.plexWatchlist, 'generateAndSaveRssFeeds').mockRejectedValue(
      new Error('No Plex Pass'),
    )
    vi.spyOn(app.plexWatchlist, 'checkFriendChanges').mockResolvedValue({
      added: [],
      removed: [],
      userMap: new Map(),
    })
    vi.spyOn(app.plexWatchlist, 'getSelfWatchlist').mockResolvedValue({
      total: 0,
      users: [],
    })
    vi.spyOn(app.plexWatchlist, 'getOthersWatchlists').mockResolvedValue({
      total: 0,
      users: [],
    })
    app.config._isReady = false

    expect((await startInBackground(true)).statusCode).toBe(202)

    await vi.waitFor(() => expect(app.config._isReady).toBe(true), {
      timeout: 10_000,
    })
    expect((await status()).status).toBe('running')
  })

  it('keeps the blocking start route answering with its old shape', async () => {
    vi.spyOn(app.plexWatchlist, 'pingPlex').mockRejectedValue(
      new Error('Plex down'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-workflow/start',
      payload: {},
    })

    expect(res.statusCode).toBe(500)
    expect(Object.keys(res.json()).sort()).toEqual([
      'error',
      'message',
      'statusCode',
    ])
  })
})
