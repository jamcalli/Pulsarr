import {
  type MetadataRefreshDeps,
  MetadataRefreshService,
} from '@services/metadata-refresh.service.js'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { createDeferred, type Deferred } from '../../helpers/deferred.js'
import { createMockLogger } from '../../mocks/logger.js'

type PlexWatchlistDeps = MetadataRefreshDeps['plexWatchlist']
type WatchlistResult = Awaited<
  ReturnType<PlexWatchlistDeps['getSelfWatchlist']>
>

describe('MetadataRefreshService', () => {
  let self: Deferred<WatchlistResult>
  let others: Deferred<WatchlistResult>
  let getSelfWatchlist: Mock<PlexWatchlistDeps['getSelfWatchlist']>
  let getOthersWatchlists: Mock<PlexWatchlistDeps['getOthersWatchlists']>
  let service: MetadataRefreshService

  const queueNextRefresh = () => {
    self = createDeferred<WatchlistResult>()
    others = createDeferred<WatchlistResult>()
    getSelfWatchlist.mockReturnValueOnce(self.promise)
    getOthersWatchlists.mockReturnValueOnce(others.promise)
  }

  const waitForIdle = () =>
    vi.waitFor(() => expect(service.isRunning()).toBe(false))

  beforeEach(() => {
    getSelfWatchlist = vi.fn<PlexWatchlistDeps['getSelfWatchlist']>()
    getOthersWatchlists = vi.fn<PlexWatchlistDeps['getOthersWatchlists']>()
    service = new MetadataRefreshService({
      plexWatchlist: { getSelfWatchlist, getOthersWatchlists },
      log: createMockLogger(),
    })
    queueNextRefresh()
  })

  it('starts a refresh and reports it as running', () => {
    expect(service.isRunning()).toBe(false)

    expect(service.start()).toBe(true)

    expect(service.isRunning()).toBe(true)
    expect(getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(getSelfWatchlist).toHaveBeenCalledWith(true)
    expect(getOthersWatchlists).toHaveBeenCalledTimes(1)
    expect(getOthersWatchlists).toHaveBeenCalledWith(true)
  })

  it('refuses a second start while one is in flight', () => {
    expect(service.start()).toBe(true)

    expect(service.start()).toBe(false)
    expect(getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(getOthersWatchlists).toHaveBeenCalledTimes(1)
  })

  it('clears the guard once the refresh resolves', async () => {
    service.start()

    self.resolve({ total: 3, users: [] })
    others.resolve({ total: 2, users: [] })
    await waitForIdle()

    queueNextRefresh()
    expect(service.start()).toBe(true)
    expect(getSelfWatchlist).toHaveBeenCalledTimes(2)
    expect(getOthersWatchlists).toHaveBeenCalledTimes(2)
  })

  it('keeps the guard while one refresh has failed and the other is pending', async () => {
    service.start()

    self.reject(new Error('Plex unavailable'))
    await Promise.resolve()

    expect(service.isRunning()).toBe(true)
    expect(service.start()).toBe(false)

    others.resolve({ total: 0, users: [] })
    await waitForIdle()
    expect(getSelfWatchlist).toHaveBeenCalledTimes(1)
  })

  it('clears the guard once the refresh rejects', async () => {
    service.start()

    self.reject(new Error('Plex unavailable'))
    others.reject(new Error('Plex unavailable'))
    await waitForIdle()

    queueNextRefresh()
    expect(service.start()).toBe(true)
    expect(getSelfWatchlist).toHaveBeenCalledTimes(2)
    expect(getOthersWatchlists).toHaveBeenCalledTimes(2)
  })

  it('run awaits the refresh before resolving', async () => {
    const running = service.run()
    expect(service.isRunning()).toBe(true)

    self.resolve({ total: 3, users: [] })
    others.resolve({ total: 2, users: [] })
    await running

    expect(service.isRunning()).toBe(false)
  })

  it('run rejects when the refresh fails', async () => {
    const running = service.run()

    self.reject(new Error('Plex unavailable'))
    others.reject(new Error('Plex unavailable'))

    await expect(running).rejects.toThrow('Plex unavailable')
    expect(service.isRunning()).toBe(false)
  })

  it('run resolves without a second refresh while one is in flight', async () => {
    const running = service.run()

    await service.run()

    expect(service.isRunning()).toBe(true)
    expect(getSelfWatchlist).toHaveBeenCalledTimes(1)
    expect(getOthersWatchlists).toHaveBeenCalledTimes(1)

    self.resolve({ total: 0, users: [] })
    others.resolve({ total: 0, users: [] })
    await running
  })

  it('shares the guard between run and start', async () => {
    const running = service.run()
    expect(service.start()).toBe(false)

    self.resolve({ total: 1, users: [] })
    others.resolve({ total: 1, users: [] })
    await running

    queueNextRefresh()
    expect(service.start()).toBe(true)

    await service.run()

    expect(getSelfWatchlist).toHaveBeenCalledTimes(2)
    expect(getOthersWatchlists).toHaveBeenCalledTimes(2)

    self.resolve({ total: 1, users: [] })
    others.resolve({ total: 1, users: [] })
    await waitForIdle()
  })
})
