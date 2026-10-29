import type { RssWatchlistItem } from '@root/types/plex.types.js'
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
import { seedConfig } from '../../helpers/seeds/config.js'
import {
  seedAll,
  useArrHandlers,
  workflowState,
} from '../../helpers/watchlist-workflow.js'
import { server } from '../../setup/msw-setup.js'

// A full app boot takes 7-10s on loaded CI runners, past the global 10s timeout
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

    // reconcile only runs inside an open run; a fresh state is aborted
    const state = workflowState(app.watchlistWorkflow)
    state.beginRun()
    try {
      await app.watchlistWorkflow.reconcile({ mode: 'full' })
    } finally {
      state.endRun()
    }

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
      http.get('http://test-radarr:7878/api/v3/movie', () =>
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
