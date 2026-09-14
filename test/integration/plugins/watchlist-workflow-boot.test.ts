import type {
  EtagPollResult,
  RssWatchlistItem,
} from '@root/types/plex.types.js'
import { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import { RECONCILIATION_JOB_NAME } from '@services/watchlist-workflow/lifecycle/scheduler.js'
import { WatchlistWorkflowService } from '@services/watchlist-workflow.service.js'
import type { FastifyInstance } from 'fastify'
import type { Knex } from 'knex'
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
import { seedConfig } from '../../helpers/seeds/config.js'
import { seedInstances } from '../../helpers/seeds/instances.js'
import { seedUsers } from '../../helpers/seeds/users.js'
import { server } from '../../setup/msw-setup.js'

function useArrHandlers(): void {
  server.use(
    http.get('http://test-sonarr:8989/api/v3/system/status', () =>
      HttpResponse.json({ version: '4.0.0' }),
    ),
    http.get('http://test-radarr:7878/api/v3/system/status', () =>
      HttpResponse.json({ version: '5.0.0' }),
    ),
    http.get('http://test-sonarr:8989/api/v3/importlistexclusion/paged', () =>
      HttpResponse.json({
        page: 1,
        pageSize: 1000,
        totalRecords: 0,
        records: [],
      }),
    ),
    http.get('http://test-radarr:7878/api/v3/exclusions/paged', () =>
      HttpResponse.json({
        page: 1,
        pageSize: 1000,
        totalRecords: 0,
        records: [],
      }),
    ),
  )
}

async function seedAll(knex: Knex): Promise<void> {
  await seedConfig(knex)
  await seedUsers(knex)
  await seedInstances(knex)
}

// Each test boots the app to exercise the boot auto-start path. Booting the
// full app takes 7-10s on loaded CI runners, so the global 10s timeout has no
// headroom.
describe('watchlist workflow boot auto-start', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function seedWithReady(isReady: boolean) {
    const knex = getTestDatabase()
    await seedConfig(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: isReady })
  }

  it('starts the workflow at boot when _isReady was persisted true', async () => {
    await seedWithReady(true)
    app = await build()
    await app.ready()

    const workflow = app.watchlistWorkflow
    await vi.waitFor(
      () => expect(['starting', 'running']).toContain(workflow.getStatus()),
      { timeout: 15_000 },
    )

    app.config.authenticationMethod = 'disabled'
    const stopRes = await app.inject({
      method: 'POST',
      url: '/v1/watchlist-workflow/stop',
    })
    expect(stopRes.statusCode).toBe(200)
    await vi.waitFor(() => expect(workflow.getStatus()).toBe('stopped'), {
      timeout: 15_000,
    })
  })

  it('does not start the workflow at boot when _isReady was persisted false', async () => {
    await seedWithReady(false)
    app = await build()
    await app.ready()

    // the auto-start callback was queued during boot; queue behind it
    await new Promise((resolve) => setImmediate(resolve))
    expect(app.watchlistWorkflow.getStatus()).toBe('stopped')
  })

  it('does not start the workflow at boot when no config row exists', async () => {
    app = await build()
    await app.ready()

    await new Promise((resolve) => setImmediate(resolve))
    expect(app.watchlistWorkflow.getStatus()).toBe('stopped')
  })
})

describe('watchlist workflow full reconcile', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('advances the last successful sync time', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({ _isReady: false })

    useArrHandlers()

    app = await build()
    await app.ready()

    const checkFriendChanges = vi
      .spyOn(app.plexWatchlist, 'checkFriendChanges')
      .mockResolvedValue({ added: [], removed: [], userMap: new Map() })

    const before = app.watchlistWorkflow.getLastSuccessfulSyncTime()

    await app.watchlistWorkflow.reconcile({ mode: 'full' })

    expect(app.watchlistWorkflow.getLastSuccessfulSyncTime()).toBeGreaterThan(
      before,
    )
    expect(checkFriendChanges).toHaveBeenCalledTimes(1)
  })
})

describe('watchlist workflow rss mode', { timeout: 30_000 }, () => {
  let app: FastifyInstance | undefined
  let service: WatchlistWorkflowService | undefined

  beforeAll(async () => {
    await initializeTestDatabase()
  })

  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await service?.stop()
    service = undefined
    await app?.close()
    app = undefined
  })

  it('primes the feed, then persists and routes an item the interval finds', async () => {
    const knex = getTestDatabase()
    await seedAll(knex)
    await knex('configs').where({ id: 1 }).update({
      _isReady: false,
      selfRss: 'https://rss.test/self',
      friendsRss: 'https://rss.test/friends',
    })

    useArrHandlers()

    const selfItems: RssWatchlistItem[] = []
    let selfFetchCount = 0

    server.use(
      http.get('https://rss.test/self', () => {
        selfFetchCount += 1
        return HttpResponse.json({ items: selfItems })
      }),
      http.get('https://rss.test/friends', () =>
        HttpResponse.json({ items: [] }),
      ),
      http.get(
        'https://discover.provider.plex.tv/library/metadata/matches',
        () =>
          HttpResponse.json({
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: 'rss-movie-key',
                  title: 'Rss Movie',
                  Guid: [{ id: 'tmdb://424242' }],
                  Genre: [{ tag: 'Action' }],
                },
              ],
            },
          }),
      ),
      http.get(
        'https://discover.provider.plex.tv/library/metadata/rss-movie-key',
        () =>
          HttpResponse.json({
            MediaContainer: {
              Metadata: [
                {
                  ratingKey: 'rss-movie-key',
                  title: 'Rss Movie',
                  Guid: [{ id: 'tmdb://424242' }],
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

    vi.spyOn(app.plexWatchlist, 'generateAndSaveRssFeeds').mockResolvedValue({
      self: 'https://rss.test/self',
      friends: 'https://rss.test/friends',
    })
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

    expect(service.isRssMode()).toBe(true)
    expect(service.getIsUsingRssFallback()).toBe(false)
    expect(selfFetchCount).toBeGreaterThanOrEqual(1)

    selfItems.push({
      title: 'Rss Movie',
      pubDate: '2026-01-01T00:00:00Z',
      link: 'https://watch.plex.tv/movie/rss-movie',
      guids: ['tmdb://424242'],
      description: 'Added to the self watchlist',
      category: 'movie',
      credits: [],
      keywords: ['Action'],
    })

    await vi.waitFor(
      async () => {
        const rows = await knex('watchlist_items').where({
          key: 'rss-movie-key',
        })
        expect(rows).toHaveLength(1)
        expect(rows[0].user_id).toBe(1)
      },
      { timeout: 10_000 },
    )

    expect(routeContent).toHaveBeenCalledTimes(1)
    expect(routeContent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Rss Movie', type: 'movie' }),
      'rss-movie-key',
      expect.objectContaining({ userId: 1 }),
    )

    await service.stop()
    expect(service.getStatus()).toBe('stopped')
  })
})

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
