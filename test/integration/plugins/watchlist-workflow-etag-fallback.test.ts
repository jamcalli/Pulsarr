import type { EtagPollResult } from '@root/types/plex.types.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { RECONCILIATION_JOB_NAME } from '@services/watchlist-workflow/lifecycle/scheduler.js'
import { WatchlistWorkflowService } from '@services/watchlist-workflow.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import {
  getTestDatabase,
  initializeTestDatabase,
  resetDatabase,
} from '../../helpers/database.js'
import { seedAll, useArrHandlers } from '../../helpers/watchlist-workflow.js'
import { server } from '../../setup/msw-setup.js'

describe('watchlist workflow etag fallback', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined
  let service: WatchlistWorkflowService | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await service?.stop()
    service = undefined
    await app?.close()
    app = undefined
  })

  it('falls back to the real poller and reconciles on the scheduled tick', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: false })

    useArrHandlers()

    app = await build()
    await app.ready()

    vi.spyOn(app.plexWatchlist, 'generateAndSaveRssFeeds').mockRejectedValue(
      new Error('rss unavailable'),
    )
    const checkFriendChanges = vi
      .spyOn(app.plexWatchlist, 'checkFriendChanges')
      .mockResolvedValue({ added: [], removed: [], userMap: new Map() })
    const routeContent = vi
      .spyOn(app.contentRouter, 'routeContent')
      .mockResolvedValue({ routedInstances: [], routingDetails: [] })

    service = new WatchlistWorkflowService(app.log, app, 50)
    await service.startWorkflow()

    expect(service.getIsUsingRssFallback()).toBe(true)
    expect(service.isRssMode()).toBe(false)

    await vi.waitFor(
      () => expect(checkFriendChanges).toHaveBeenCalledTimes(4),
      {
        timeout: 10_000,
      },
    )

    const syncTimeBefore = service.getLastSuccessfulSyncTime()
    const callsBefore = checkFriendChanges.mock.calls.length

    await expect(
      app.scheduler.runJobNow(RECONCILIATION_JOB_NAME),
    ).resolves.toBe(true)

    expect(service.getLastSuccessfulSyncTime()).toBeGreaterThanOrEqual(
      syncTimeBefore,
    )
    expect(checkFriendChanges).toHaveBeenCalledTimes(callsBefore + 1)
    expect(routeContent).not.toHaveBeenCalled()
  })

  it('releases the schedule and queue when startup fails, and can start again', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: false })

    useArrHandlers()

    app = await build()
    await app.ready()

    vi.spyOn(app.plexWatchlist, 'generateAndSaveRssFeeds').mockRejectedValue(
      new Error('rss unavailable'),
    )
    const checkFriendChanges = vi
      .spyOn(app.plexWatchlist, 'checkFriendChanges')
      .mockRejectedValue(new Error('plex down'))

    service = new WatchlistWorkflowService(app.log, app, 50)

    await expect(service.startWorkflow()).rejects.toThrow('plex down')

    expect(service.getStatus()).toBe('stopped')
    expect(app.scheduler.getActiveJobs()).not.toContain(RECONCILIATION_JOB_NAME)

    checkFriendChanges.mockResolvedValue({
      added: [],
      removed: [],
      userMap: new Map(),
    })

    await expect(service.startWorkflow()).resolves.toBe(true)
    expect(service.getStatus()).toBe('running')
    expect(app.scheduler.getActiveJobs()).toContain(RECONCILIATION_JOB_NAME)
  })

  it('drops an in-flight etag reconcile when the service stops mid-poll', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: false })

    useArrHandlers()
    server.use(
      http.get(
        'https://discover.provider.plex.tv/library/metadata/stopped-movie',
        () =>
          HttpResponse.json({
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: 'stopped-movie',
                  title: 'Stopped Movie',
                  Guid: [{ id: 'tmdb://880088' }],
                  Genre: [{ tag: 'Action' }],
                },
              ],
            },
          }),
      ),
      http.get('http://test-radarr:7878/api/v3/movie/lookup', () =>
        HttpResponse.json([]),
      ),
    )

    app = await build()
    await app.ready()

    vi.spyOn(app.plexWatchlist, 'generateAndSaveRssFeeds').mockRejectedValue(
      new Error('rss unavailable'),
    )
    vi.spyOn(app.plexWatchlist, 'checkFriendChanges').mockResolvedValue({
      added: [],
      removed: [],
      userMap: new Map(),
    })
    const routeContent = vi
      .spyOn(app.contentRouter, 'routeContent')
      .mockResolvedValue({ routedInstances: [], routingDetails: [] })

    service = new WatchlistWorkflowService(app.log, app, 50)
    await service.startWorkflow()

    const change: EtagPollResult = {
      changed: true,
      userId: 1,
      isPrimary: true,
      newItems: [
        { id: 'stopped-movie', title: 'Stopped Movie', type: 'movie' },
      ],
    }
    vi.spyOn(EtagPoller.prototype, 'checkAllEtags').mockImplementationOnce(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
        return [change]
      },
    )

    const reconciling = service.reconcile({ mode: 'etag' })

    await new Promise((resolve) => setTimeout(resolve, 50))
    await service.stop()
    service = undefined

    await reconciling

    expect(routeContent).not.toHaveBeenCalled()
    const rows = await knex('watchlist_items').where({ key: 'stopped-movie' })
    expect(rows).toHaveLength(0)
  })

  it('drains queued etag changes once Sonarr recovers', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: false })

    useArrHandlers()
    server.use(
      http.get(
        'https://discover.provider.plex.tv/library/metadata/deferred-movie',
        () =>
          HttpResponse.json({
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: 'deferred-movie',
                  title: 'Deferred Movie',
                  Guid: [{ id: 'tmdb://990099' }],
                  Genre: [{ tag: 'Action' }],
                },
              ],
            },
          }),
      ),
      http.get('http://test-radarr:7878/api/v3/movie/lookup', () =>
        HttpResponse.json([]),
      ),
    )

    app = await build()
    await app.ready()

    vi.spyOn(app.plexWatchlist, 'generateAndSaveRssFeeds').mockRejectedValue(
      new Error('rss unavailable'),
    )
    vi.spyOn(app.plexWatchlist, 'checkFriendChanges').mockResolvedValue({
      added: [],
      removed: [],
      userMap: new Map(),
    })
    const routeContent = vi
      .spyOn(app.contentRouter, 'routeContent')
      .mockResolvedValue({ routedInstances: [], routingDetails: [] })

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    service = new WatchlistWorkflowService(app.log, app, 50)
    await service.startWorkflow()

    server.use(
      http.get('http://test-sonarr:8989/api/v3/system/status', () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    )

    const change: EtagPollResult = {
      changed: true,
      userId: 1,
      isPrimary: true,
      newItems: [
        { id: 'deferred-movie', title: 'Deferred Movie', type: 'movie' },
      ],
    }
    vi.spyOn(EtagPoller.prototype, 'checkAllEtags').mockResolvedValueOnce([
      change,
    ])

    await service.reconcile({ mode: 'etag' })

    expect(routeContent).not.toHaveBeenCalled()

    server.use(
      http.get('http://test-sonarr:8989/api/v3/system/status', () =>
        HttpResponse.json({ version: '4.0.0' }),
      ),
    )

    // the deferred queue drains on its own two-minute health-check interval
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    vi.useRealTimers()

    await vi.waitFor(
      async () => {
        const rows = await knex('watchlist_items').where({
          key: 'deferred-movie',
        })
        expect(rows).toHaveLength(1)
      },
      { timeout: 10_000 },
    )

    expect(routeContent).toHaveBeenCalledTimes(1)
    expect(routeContent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Deferred Movie', type: 'movie' }),
      'deferred-movie',
      expect.objectContaining({ userId: 1 }),
    )
  })
})
