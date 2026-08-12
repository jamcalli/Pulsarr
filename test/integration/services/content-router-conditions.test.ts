import type { ContentItem } from '@root/types/router.types.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
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
import {
  seedConfig,
  seedInstances,
  seedUsers,
} from '../../helpers/seeds/index.js'

describe('routeContent condition evaluation', () => {
  let fastify: FastifyInstance
  let routeItemToRadarr: ReturnType<typeof vi.fn>

  const comedyMovie: ContentItem = {
    title: 'Test Comedy Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    genres: ['Comedy'],
  }

  const dramaComedyMovie: ContentItem = {
    title: 'Test Dramedy Movie',
    type: 'movie',
    guids: ['imdb:tt8888888', 'tmdb:88888'],
    genres: ['Comedy', 'Drama'],
  }

  // Inserts a rule targeting instance 2 so a rule match ([2]) is
  // distinguishable from the default-instance fallback ([1])
  const insertRule = async (
    condition: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
  ): Promise<void> => {
    await getTestDatabase()('router_rules').insert({
      id: 60,
      name: 'Condition Test Rule',
      type: 'conditional',
      target_type: 'radarr',
      target_instance_id: 2,
      tags: JSON.stringify([]),
      order: 50,
      enabled: true,
      criteria: JSON.stringify({ condition }),
      ...overrides,
    })
    fastify.contentRouter.clearRouterRulesCache()
  }

  const route = (item: ContentItem, key: string, userId = 1) =>
    fastify.contentRouter.routeContent(item, key, {
      userId,
      userName: `User ${userId}`,
    })

  beforeAll(async () => {
    fastify = await build()
    await fastify.ready()
  })

  afterAll(async () => {
    await fastify.close()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    const knex = getTestDatabase()
    await resetDatabase()
    await seedConfig(knex)
    await seedUsers(knex)
    await seedInstances(knex)
    await knex('radarr_instances').insert({
      id: 2,
      name: 'Rule Target Radarr',
      base_url: 'http://test-radarr-2:7878',
      api_key: 'test_radarr_api_key_2',
      quality_profile: '1',
      root_folder: '/data/movies2',
      is_default: false,
      is_enabled: true,
      tags: JSON.stringify([]),
      synced_instances: JSON.stringify([]),
    })
    fastify.contentRouter.clearRouterRulesCache()
    fastify.config.authenticationMethod = 'disabled'

    routeItemToRadarr = vi.fn().mockResolvedValue(undefined)
    fastify.radarrManager.routeItemToRadarr =
      routeItemToRadarr as unknown as RadarrManagerService['routeItemToRadarr']
  })

  describe('compound conditions', () => {
    it('AND requires every criterion, across different field evaluators', async () => {
      await insertRule({
        operator: 'AND',
        negate: false,
        conditions: [
          {
            field: 'genres',
            operator: 'contains',
            value: 'Comedy',
            negate: false,
          },
          { field: 'user', operator: 'equals', value: 1, negate: false },
        ],
      })

      // User 1 satisfies both criteria - rule wins
      const match = await route(comedyMovie, 'and-match-key', 1)
      expect(match.routedInstances).toEqual([2])

      // User 2 fails the user criterion - falls back to the default instance
      const noMatch = await route(comedyMovie, 'and-no-match-key', 2)
      expect(noMatch.routedInstances).toEqual([1])
    })

    it('OR matches on any criterion', async () => {
      await insertRule({
        operator: 'OR',
        negate: false,
        conditions: [
          {
            field: 'genres',
            operator: 'contains',
            value: 'Horror',
            negate: false,
          },
          {
            field: 'genres',
            operator: 'contains',
            value: 'Comedy',
            negate: false,
          },
        ],
      })

      const result = await route(comedyMovie, 'or-match-key')
      expect(result.routedInstances).toEqual([2])
    })

    it('evaluates nested groups with negated leaf conditions', async () => {
      // (Horror OR Comedy) AND NOT Drama
      await insertRule({
        operator: 'AND',
        negate: false,
        conditions: [
          {
            operator: 'OR',
            negate: false,
            conditions: [
              {
                field: 'genres',
                operator: 'contains',
                value: 'Horror',
                negate: false,
              },
              {
                field: 'genres',
                operator: 'contains',
                value: 'Comedy',
                negate: false,
              },
            ],
          },
          {
            field: 'genres',
            operator: 'contains',
            value: 'Drama',
            negate: true,
          },
        ],
      })

      const pureComedy = await route(comedyMovie, 'nested-match-key')
      expect(pureComedy.routedInstances).toEqual([2])

      // Matches the OR half but is vetoed by the negated Drama leaf
      const dramedy = await route(dramaComedyMovie, 'nested-no-match-key')
      expect(dramedy.routedInstances).toEqual([1])
    })

    it('applies negation on a whole group', async () => {
      await insertRule({
        operator: 'AND',
        negate: true,
        conditions: [
          {
            field: 'genres',
            operator: 'contains',
            value: 'Drama',
            negate: false,
          },
        ],
      })

      // Comedy does not match Drama, group negation flips it to a match
      const comedy = await route(comedyMovie, 'group-negate-match-key')
      expect(comedy.routedInstances).toEqual([2])

      const dramedy = await route(dramaComedyMovie, 'group-negate-no-match-key')
      expect(dramedy.routedInstances).toEqual([1])
    })

    it('matches list membership with the in operator', async () => {
      await insertRule({
        operator: 'AND',
        negate: false,
        conditions: [
          {
            field: 'genres',
            operator: 'in',
            value: ['Horror', 'Comedy'],
            negate: false,
          },
        ],
      })

      const result = await route(comedyMovie, 'in-match-key')
      expect(result.routedInstances).toEqual([2])
    })

    it('never matches an empty condition group', async () => {
      await insertRule({ operator: 'AND', negate: false, conditions: [] })

      const result = await route(comedyMovie, 'empty-group-key')
      expect(result.routedInstances).toEqual([1])
    })

    it('skips a rule whose condition field no evaluator owns', async () => {
      await insertRule({
        operator: 'AND',
        negate: false,
        conditions: [
          {
            field: 'genrez',
            operator: 'contains',
            value: 'Comedy',
            negate: false,
          },
        ],
      })

      const result = await route(comedyMovie, 'unknown-field-key')
      expect(result.routedInstances).toEqual([1])
    })
  })

  describe('rules cache', () => {
    it('serves cached rules until the cache is cleared', async () => {
      // Warm the cache with no rules present
      const before = await route(comedyMovie, 'cache-warm-key')
      expect(before.routedInstances).toEqual([1])

      // Insert directly, bypassing the API - the cache must NOT see it
      await getTestDatabase()('router_rules').insert({
        id: 61,
        name: 'Cached Rule',
        type: 'conditional',
        target_type: 'radarr',
        target_instance_id: 2,
        tags: JSON.stringify([]),
        order: 50,
        enabled: true,
        criteria: JSON.stringify({
          condition: {
            operator: 'AND',
            negate: false,
            conditions: [
              {
                field: 'genres',
                operator: 'contains',
                value: 'Comedy',
                negate: false,
              },
            ],
          },
        }),
      })

      const stale = await route(comedyMovie, 'cache-stale-key')
      expect(stale.routedInstances).toEqual([1])

      fastify.contentRouter.clearRouterRulesCache()

      const fresh = await route(comedyMovie, 'cache-fresh-key')
      expect(fresh.routedInstances).toEqual([2])
    })

    it('picks up rules created through the API without a manual cache clear', async () => {
      // Warm the cache first so the create must invalidate it
      const before = await route(comedyMovie, 'api-cache-warm-key')
      expect(before.routedInstances).toEqual([1])

      const createRes = await fastify.inject({
        method: 'POST',
        url: '/v1/content-router/rules',
        payload: {
          name: 'API Created Rule',
          target_type: 'radarr',
          target_instance_id: 2,
          condition: {
            operator: 'AND',
            negate: false,
            conditions: [
              {
                field: 'genres',
                operator: 'contains',
                value: 'Comedy',
                negate: false,
              },
            ],
          },
        },
      })
      expect(createRes.statusCode).toBe(201)

      const after = await route(comedyMovie, 'api-cache-fresh-key')
      expect(after.routedInstances).toEqual([2])
    })
  })
})
