import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import { routeMovie } from '@services/watchlist-workflow/routing/content-router.js'
import { retryRoutingFailures } from '@services/watchlist-workflow/routing/failure-retry.js'
import { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { ContentRoutingDeps } from '@services/watchlist-workflow/types.js'
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
import {
  seedConfig,
  seedInstances,
  seedUserQuota,
  seedUsers,
} from '../../helpers/seeds/index.js'
import { echoAppliedRadarr } from '../../mocks/applied-routing.js'

const guids = ['imdb:tt7777777', 'tmdb:77777']

const insertWatchlistItem = async (
  userId: number,
  key: string,
  overrides: Record<string, unknown> = {},
): Promise<number> => {
  const [row] = await getTestDatabase()('watchlist_items')
    .insert({
      user_id: userId,
      key,
      title: `Title ${key}`,
      type: 'movie',
      thumb: '/poster.jpg',
      guids: JSON.stringify(guids),
      genres: JSON.stringify(['Comedy']),
      status: 'pending',
      ...overrides,
    })
    .returning('id')
  return typeof row === 'object' ? row.id : row
}

const failureRows = () =>
  getTestDatabase()('watchlist_routing_failures')
    .select('*')
    .orderBy('instance_id')

describe('routing failures', () => {
  let fastify: FastifyInstance

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    await seedUsers(knex)
    await seedInstances(knex)
    fastify.contentRouter.clearRouterRulesCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('database methods', () => {
    it('records a failure with one attempt and matching first and last times', async () => {
      const id = await insertWatchlistItem(1, 'a')

      expect(
        await fastify.db.setRoutingFailures(1, 'a', [
          { category: 'arr_error', message: 'bad', instanceId: 1 },
        ]),
      ).toBe(true)

      const [row] = await failureRows()
      expect(row).toMatchObject({
        watchlist_item_id: id,
        instance_id: 1,
        category: 'arr_error',
        message: 'bad',
        attempt_count: 1,
      })
      expect(row.first_failed_at).toBe(row.last_failed_at)
    })

    it('counts a recurring failure and keeps its first time', async () => {
      await insertWatchlistItem(1, 'a')
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'arr_error', message: 'first', instanceId: 1 },
      ])
      const [before] = await failureRows()
      await new Promise((resolve) => setTimeout(resolve, 5))

      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'instance_unavailable', message: 'second', instanceId: 1 },
      ])

      const [after] = await failureRows()
      expect(after).toMatchObject({
        id: before.id,
        attempt_count: 2,
        category: 'instance_unavailable',
        message: 'second',
        first_failed_at: before.first_failed_at,
      })
      expect(after.last_failed_at).not.toBe(before.last_failed_at)
    })

    it('drops failures that did not recur on the latest attempt', async () => {
      await insertWatchlistItem(1, 'a')
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'arr_error', message: 'one', instanceId: 1 },
        { category: 'arr_error', message: 'two', instanceId: 2 },
      ])

      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'arr_error', message: 'two', instanceId: 2 },
      ])

      const rows = await failureRows()
      expect(rows.map((row) => [row.instance_id, row.attempt_count])).toEqual([
        [2, 2],
      ])
    })

    it('stores an item-level failure under instance 0 and reads it back as null', async () => {
      await insertWatchlistItem(1, 'a')
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'no_route', message: 'none' },
      ])

      expect((await failureRows())[0].instance_id).toBe(0)
      const [failure] = await fastify.db.getRoutingFailures()
      expect(failure).toMatchObject({
        instance_id: null,
        instance_type: null,
        instance_name: null,
      })
    })

    it('records nothing when the user has no watchlist row for the key', async () => {
      expect(
        await fastify.db.setRoutingFailures(1, 'missing', [
          { category: 'no_route', message: 'none' },
        ]),
      ).toBe(false)
      expect(await failureRows()).toEqual([])
    })

    it('clears only the given user item', async () => {
      await insertWatchlistItem(1, 'a')
      await insertWatchlistItem(2, 'a')
      for (const userId of [1, 2]) {
        await fastify.db.setRoutingFailures(userId, 'a', [
          { category: 'no_route', message: 'none' },
        ])
      }

      expect(await fastify.db.clearRoutingFailures(1, 'a')).toBe(1)
      expect(await fastify.db.setRoutingFailures(2, 'a', [])).toBe(true)
      expect(await failureRows()).toEqual([])
    })

    it('removes failures with their watchlist item', async () => {
      await insertWatchlistItem(1, 'a')
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'no_route', message: 'none' },
      ])

      await getTestDatabase()('watchlist_items').where({ key: 'a' }).delete()

      expect(await failureRows()).toEqual([])
    })

    it('lists failures with user and instance names, filtered by user and category', async () => {
      await insertWatchlistItem(1, 'a')
      await insertWatchlistItem(2, 'b', { type: 'show' })
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'arr_error', message: 'bad', instanceId: 1 },
      ])
      await fastify.db.setRoutingFailures(2, 'b', [
        { category: 'missing_ids', message: 'no id' },
      ])

      const all = await fastify.db.getRoutingFailures()
      expect(all).toHaveLength(2)
      expect(all.find((f) => f.key === 'a')).toMatchObject({
        user_id: 1,
        username: 'test-user-primary',
        title: 'Title a',
        thumb: '/poster.jpg',
        instance_type: 'radarr',
        instance_id: 1,
        instance_name: 'Test Radarr',
        attempt_count: 1,
      })

      expect(
        (await fastify.db.getRoutingFailures({ userId: 2 })).map((f) => f.key),
      ).toEqual(['b'])
      expect(
        (await fastify.db.getRoutingFailures({ category: 'arr_error' })).map(
          (f) => f.key,
        ),
      ).toEqual(['a'])
    })

    it('summarises items once each, with missing ids not actionable', async () => {
      await insertWatchlistItem(1, 'a')
      await insertWatchlistItem(1, 'b')
      await insertWatchlistItem(2, 'c')
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'arr_error', message: 'x', instanceId: 1 },
        { category: 'arr_error', message: 'y', instanceId: 2 },
      ])
      await fastify.db.setRoutingFailures(1, 'b', [
        { category: 'missing_ids', message: 'no id' },
      ])
      await fastify.db.setRoutingFailures(2, 'c', [
        { category: 'no_route', message: 'none' },
      ])

      expect(await fastify.db.getRoutingFailureSummary()).toEqual({
        total: 3,
        actionable: 2,
        byCategory: {
          arr_error: 1,
          instance_unavailable: 0,
          no_route: 1,
          routing_error: 0,
          missing_ids: 1,
        },
        byUser: [
          { userId: 1, total: 2, actionable: 1 },
          { userId: 2, total: 1, actionable: 1 },
        ],
      })
    })

    it('leaves low-severity-only items out of the retry ids unless asked for', async () => {
      const a = await insertWatchlistItem(1, 'a')
      const b = await insertWatchlistItem(1, 'b')
      const c = await insertWatchlistItem(2, 'c')
      await fastify.db.setRoutingFailures(1, 'a', [
        { category: 'arr_error', message: 'x', instanceId: 1 },
      ])
      await fastify.db.setRoutingFailures(1, 'b', [
        { category: 'missing_ids', message: 'no id' },
      ])
      await fastify.db.setRoutingFailures(2, 'c', [
        { category: 'no_route', message: 'none' },
      ])

      expect(await fastify.db.getRoutingFailureItemIds()).toEqual([a, c])
      expect(await fastify.db.getRoutingFailureItemIds({ userId: 1 })).toEqual([
        a,
      ])
      expect(
        await fastify.db.getRoutingFailureItemIds({ category: 'missing_ids' }),
      ).toEqual([b])
      expect(await fastify.db.getRoutingFailureKeys()).toEqual(
        new Set(['1:a', '1:b', '2:c']),
      )
      expect(await fastify.db.hasRoutingFailures(a)).toBe(true)
    })
  })

  describe('through the watchlist routing path', () => {
    let deps: ContentRoutingDeps
    let routeItemToRadarr: ReturnType<typeof vi.fn>
    const key = 'routing-failure-key'

    const radarrItem: RadarrItem = {
      title: 'Failure Movie',
      type: 'movie',
      guids,
      genres: ['Comedy'],
    }

    const route = () =>
      routeMovie(
        {
          tempItem: { title: radarrItem.title, key, type: 'movie', guids },
          userId: 1,
          userName: undefined,
          radarrItem,
          existingMovies: [],
          primaryUser: null,
        },
        deps,
      )

    const insertRadarrInstance = (id: number) =>
      getTestDatabase()('radarr_instances').insert({
        id,
        name: `Radarr ${id}`,
        base_url: `http://test-radarr-${id}:7878`,
        api_key: `test_radarr_api_key_${id}`,
        quality_profile: '1',
        root_folder: `/data/movies${id}`,
        is_default: false,
        is_enabled: true,
        tags: JSON.stringify([]),
        synced_instances: JSON.stringify([]),
      })

    const seedComedyRule = (id: number, instanceId: number) =>
      getTestDatabase()('router_rules').insert({
        id,
        name: `Comedy Route ${instanceId}`,
        type: 'conditional',
        target_type: 'radarr',
        target_instance_id: instanceId,
        root_folder: `/data/comedy-${instanceId}`,
        quality_profile: 2,
        tags: JSON.stringify([]),
        order: 50,
        enabled: true,
        search_on_add: true,
        always_require_approval: false,
        bypass_user_quotas: false,
        criteria: JSON.stringify({
          condition: {
            negate: false,
            operator: 'AND',
            conditions: [
              {
                field: 'genres',
                value: 'Comedy',
                negate: false,
                operator: 'contains',
              },
            ],
          },
        }),
      })

    beforeEach(async () => {
      await insertWatchlistItem(1, key)
      routeItemToRadarr = vi.fn(echoAppliedRadarr())
      fastify.radarrManager.routeItemToRadarr =
        routeItemToRadarr as unknown as RadarrManagerService['routeItemToRadarr']
      fastify.radarrManager.movieExistsByTmdbId = vi.fn(async () => ({
        found: false,
        checked: true,
      })) as unknown as RadarrManagerService['movieExistsByTmdbId']
      fastify.notifications.sendWatchlistAdded = vi.fn(async () => true)
      fastify.notifications.sendWatchlistCapReached = vi.fn()

      const state = new WorkflowState()
      state.beginRun()
      deps = {
        logger: fastify.log,
        config: { ...fastify.config, skipIfExistsOnPlex: false },
        db: fastify.db,
        fastify,
        state,
        contentRouter: fastify.contentRouter,
        sonarrManager: fastify.sonarrManager,
        radarrManager: fastify.radarrManager,
        plexServerService: fastify.plexServerService,
        plexService: fastify.plexWatchlist,
        notifications: fastify.notifications,
      }
    })

    it('records an add the instance refused as arr_error on that instance', async () => {
      routeItemToRadarr.mockRejectedValue(
        new Error('Radarr API error: Root folder does not exist'),
      )

      expect(await route()).toMatchObject({ routed: false })

      expect(await fastify.db.getRoutingFailures()).toEqual([
        expect.objectContaining({
          key,
          instance_id: 1,
          instance_name: 'Test Radarr',
          category: 'arr_error',
          message: 'Radarr API error: Root folder does not exist',
        }),
      ])
    })

    it('records an unreachable instance as instance_unavailable', async () => {
      routeItemToRadarr.mockRejectedValue(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
        }),
      )

      await route()

      expect((await fastify.db.getRoutingFailures())[0].category).toBe(
        'instance_unavailable',
      )
    })

    it('records only the failed instance when a rule route partly succeeds', async () => {
      await insertRadarrInstance(2)
      await seedComedyRule(50, 1)
      await seedComedyRule(51, 2)
      fastify.contentRouter.clearRouterRulesCache()
      routeItemToRadarr.mockImplementation(
        async (_item: unknown, _key: string, _userId: number, id: number) => {
          if (id === 2) throw new Error('Invalid quality profile')
          return echoAppliedRadarr()(_item, _key, _userId, id)
        },
      )

      expect(await route()).toMatchObject({ routed: true })

      const failures = await fastify.db.getRoutingFailures()
      expect(failures.map((f) => [f.instance_id, f.category])).toEqual([
        [2, 'arr_error'],
      ])
    })

    it('records no route when there is no usable default instance', async () => {
      await getTestDatabase()('radarr_instances').update({ is_default: false })

      expect(await route()).toEqual({
        routed: false,
        skippedReason: 'no-target',
      })

      expect((await fastify.db.getRoutingFailures())[0]).toMatchObject({
        category: 'no_route',
        instance_id: null,
      })
    })

    it('clears the failure once a later attempt routes', async () => {
      routeItemToRadarr.mockRejectedValueOnce(new Error('bad'))
      await route()
      expect(await fastify.db.getRoutingFailures()).toHaveLength(1)

      expect(await route()).toMatchObject({ routed: true })

      expect(await fastify.db.getRoutingFailures()).toEqual([])
    })

    it('clears the failure once the item is found in the instance', async () => {
      routeItemToRadarr.mockRejectedValueOnce(new Error('bad'))
      await route()

      const result = await routeMovie(
        {
          tempItem: { title: radarrItem.title, key, type: 'movie', guids },
          userId: 1,
          userName: undefined,
          radarrItem,
          existingMovies: [{ ...radarrItem, radarr_instance_id: 1 }],
          routingFailureKeys: await fastify.db.getRoutingFailureKeys(),
          primaryUser: null,
        },
        deps,
      )

      expect(result.skippedReason).toBe('exists-in-target')
      expect(await fastify.db.getRoutingFailures()).toEqual([])
    })

    it('records nothing when an exhausted quota sends the item to approval', async () => {
      await seedUserQuota(getTestDatabase(), {
        user_id: 1,
        content_type: 'movie',
        quota_limit: 1,
      })
      await fastify.quotaService.recordUsage(1, 'movie')

      expect(await route()).toEqual({ routed: false })

      expect(routeItemToRadarr).not.toHaveBeenCalled()
      expect(await fastify.db.getRoutingFailures()).toEqual([])
      expect(
        await getTestDatabase()('approval_requests').where({
          content_key: key,
        }),
      ).toHaveLength(1)
    })

    describe('retry', () => {
      const itemId = async () =>
        (await getTestDatabase()('watchlist_items').where({ key }).first()).id

      it('routes a failed item again and clears it on success', async () => {
        routeItemToRadarr.mockRejectedValueOnce(new Error('bad'))
        await route()

        const result = await retryRoutingFailures([await itemId()], deps)

        expect(result).toEqual({
          attempted: 1,
          resolved: 1,
          stillFailing: 0,
          skipped: 0,
        })
        expect(routeItemToRadarr).toHaveBeenCalledTimes(2)
        expect(await fastify.db.getRoutingFailures()).toEqual([])
      })

      it('keeps the failure and counts another attempt when the add fails again', async () => {
        routeItemToRadarr.mockRejectedValue(new Error('bad'))
        await route()

        const result = await retryRoutingFailures([await itemId()], deps)

        expect(result.stillFailing).toBe(1)
        expect((await fastify.db.getRoutingFailures())[0].attempt_count).toBe(2)
      })

      it('respects an exhausted quota by creating an approval request instead of adding', async () => {
        routeItemToRadarr.mockRejectedValueOnce(new Error('bad'))
        await route()
        await seedUserQuota(getTestDatabase(), {
          user_id: 1,
          content_type: 'movie',
          quota_limit: 1,
        })
        await fastify.quotaService.recordUsage(1, 'movie')
        await fastify.quotaService.recordUsage(1, 'movie')

        const result = await retryRoutingFailures([await itemId()], deps)

        expect(result.resolved).toBe(1)
        expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
        expect(
          await getTestDatabase()('approval_requests').where({
            content_key: key,
          }),
        ).toHaveLength(1)
      })

      it('respects a user that requires approval', async () => {
        routeItemToRadarr.mockRejectedValueOnce(new Error('bad'))
        await route()
        await getTestDatabase()('users')
          .where({ id: 1 })
          .update({ requires_approval: true })

        await retryRoutingFailures([await itemId()], deps)

        expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
        expect(
          await getTestDatabase()('approval_requests').where({
            content_key: key,
            status: 'pending',
          }),
        ).toHaveLength(1)
      })

      it('respects an exclusion and clears the failure', async () => {
        routeItemToRadarr.mockRejectedValueOnce(new Error('bad'))
        await route()
        await fastify.db.excludeWatchlistItem(key, [1], 'Excluded', 'movie', [])

        const result = await retryRoutingFailures([await itemId()], deps)

        expect(result.resolved).toBe(1)
        expect(routeItemToRadarr).toHaveBeenCalledTimes(1)
        expect(await fastify.db.getRoutingFailures()).toEqual([])
      })
    })
  })
})
