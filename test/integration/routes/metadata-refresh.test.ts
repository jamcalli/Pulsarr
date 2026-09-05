import type { MetadataRefreshDeps } from '@services/metadata-refresh.service.js'
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
import { createDeferred } from '../../helpers/deferred.js'
import { seedAll } from '../../helpers/seeds/index.js'

type WatchlistResult = Awaited<
  ReturnType<MetadataRefreshDeps['plexWatchlist']['getSelfWatchlist']>
>

function stubWatchlists(app: FastifyInstance) {
  const self = createDeferred<WatchlistResult>()
  const others = createDeferred<WatchlistResult>()
  app.plexWatchlist.getSelfWatchlist = vi.fn().mockReturnValue(self.promise)
  app.plexWatchlist.getOthersWatchlists = vi
    .fn()
    .mockReturnValue(others.promise)
  return { self, others }
}

describe('POST /v1/metadata/refresh', () => {
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

  const postRefresh = () =>
    app.inject({ method: 'POST', url: '/v1/metadata/refresh' })

  const waitForIdle = () =>
    vi.waitFor(() => expect(app.metadataRefresh.isRunning()).toBe(false))

  it('returns 202 and starts the refresh in the background', async () => {
    const { self, others } = stubWatchlists(app)

    const res = await postRefresh()

    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({
      success: true,
      message: 'Metadata refresh started',
    })
    expect(app.plexWatchlist.getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(app.plexWatchlist.getOthersWatchlists).toHaveBeenCalledTimes(1)
    expect(app.metadataRefresh.isRunning()).toBe(true)

    self.resolve({ total: 3, users: [] })
    others.resolve({ total: 2, users: [] })
    await waitForIdle()
  })

  it('returns 409 while a refresh is already running', async () => {
    const { self, others } = stubWatchlists(app)

    const first = await postRefresh()
    expect(first.statusCode).toBe(202)

    const second = await postRefresh()
    expect(second.statusCode).toBe(409)
    expect(second.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Metadata refresh already running',
    })
    expect(app.plexWatchlist.getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(app.plexWatchlist.getOthersWatchlists).toHaveBeenCalledTimes(1)

    self.resolve({ total: 0, users: [] })
    others.resolve({ total: 0, users: [] })
    await waitForIdle()
  })

  it('accepts a new refresh once the previous one finishes', async () => {
    const first = stubWatchlists(app)

    expect((await postRefresh()).statusCode).toBe(202)

    first.self.resolve({ total: 1, users: [] })
    first.others.resolve({ total: 1, users: [] })
    await waitForIdle()

    const second = stubWatchlists(app)
    const res = await postRefresh()

    expect(res.statusCode).toBe(202)
    expect(app.plexWatchlist.getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(app.plexWatchlist.getOthersWatchlists).toHaveBeenCalledTimes(1)

    second.self.resolve({ total: 1, users: [] })
    second.others.resolve({ total: 1, users: [] })
    await waitForIdle()
  })

  it('still returns 409 when one refresh has failed and the other is pending', async () => {
    const stubs = stubWatchlists(app)

    expect((await postRefresh()).statusCode).toBe(202)

    stubs.self.reject(new Error('Plex unavailable'))
    await Promise.resolve()

    expect((await postRefresh()).statusCode).toBe(409)

    stubs.others.resolve({ total: 0, users: [] })
    await waitForIdle()
  })

  it('clears the guard when the refresh fails', async () => {
    const failing = stubWatchlists(app)

    expect((await postRefresh()).statusCode).toBe(202)

    failing.self.reject(new Error('Plex unavailable'))
    failing.others.reject(new Error('Plex unavailable'))
    await waitForIdle()

    const retry = stubWatchlists(app)
    const res = await postRefresh()

    expect(res.statusCode).toBe(202)
    expect(app.plexWatchlist.getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(app.plexWatchlist.getOthersWatchlists).toHaveBeenCalledTimes(1)

    retry.self.resolve({ total: 0, users: [] })
    retry.others.resolve({ total: 0, users: [] })
    await waitForIdle()
  })
})
