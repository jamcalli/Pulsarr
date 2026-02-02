import type { ContentItem, RoutingContext } from '@root/types/router.types.js'
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
  seedRouterRules,
  seedUsers,
} from '../../helpers/seeds/index.js'

describe('ContentRouterService Integration', () => {
  let fastify: FastifyInstance

  // Helper to access private checkApprovalRequirements method
  const getCheckApproval = () =>
    (
      fastify.contentRouter as unknown as {
        checkApprovalRequirements: (
          item: ContentItem,
          context: RoutingContext,
          decisions: unknown[],
        ) => Promise<{ required: boolean; reason?: string }>
      }
    ).checkApprovalRequirements.bind(fastify.contentRouter)

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
    await seedRouterRules(knex)
    // Clear router rules cache to pick up seeded rules
    fastify.contentRouter.clearRouterRulesCache()
  })

  describe('target_type filtering in approval checks', () => {
    // Test content items
    const dramaMovie: ContentItem = {
      title: 'Test Drama Movie',
      type: 'movie',
      guids: ['imdb:tt1234567', 'tmdb:12345'],
      genres: ['Drama', 'Thriller'],
    }

    const dramaShow: ContentItem = {
      title: 'Test Drama Show',
      type: 'show',
      guids: ['imdb:tt7654321', 'tmdb:54321'],
      genres: ['Drama', 'Mystery'],
    }

    const comedyMovie: ContentItem = {
      title: 'Test Comedy Movie',
      type: 'movie',
      guids: ['imdb:tt9999999', 'tmdb:99999'],
      genres: ['Comedy'],
    }

    it('should trigger Sonarr approval rule for Drama shows only', async () => {
      const showContext: RoutingContext = {
        userId: 1,
        userName: 'Test User',
        contentType: 'show',
        itemKey: 'test-show-key',
      }

      const movieContext: RoutingContext = {
        userId: 1,
        userName: 'Test User',
        contentType: 'movie',
        itemKey: 'test-movie-key',
      }

      const checkApproval = getCheckApproval()

      // Drama show should trigger Sonarr approval rule
      const showResult = await checkApproval(dramaShow, showContext, [])
      expect(showResult.required).toBe(true)
      expect(showResult.reason).toContain('Drama shows require approval')

      // Drama movie should NOT trigger Sonarr approval rule (wrong target_type)
      const movieResult = await checkApproval(dramaMovie, movieContext, [])
      // Should trigger Radarr rule instead
      expect(movieResult.required).toBe(true)
      expect(movieResult.reason).toContain('Drama movies require approval')
    })

    it('should trigger Radarr approval rule for Drama movies only', async () => {
      const movieContext: RoutingContext = {
        userId: 1,
        userName: 'Test User',
        contentType: 'movie',
        itemKey: 'test-movie-key',
      }

      const showContext: RoutingContext = {
        userId: 1,
        userName: 'Test User',
        contentType: 'show',
        itemKey: 'test-show-key',
      }

      const checkApproval = getCheckApproval()

      // Drama movie should trigger Radarr approval rule
      const movieResult = await checkApproval(dramaMovie, movieContext, [])
      expect(movieResult.required).toBe(true)
      expect(movieResult.reason).toContain('Drama movies require approval')

      // Drama show should NOT trigger Radarr approval rule (wrong target_type)
      // Should trigger Sonarr rule instead
      const showResult = await checkApproval(dramaShow, showContext, [])
      expect(showResult.required).toBe(true)
      expect(showResult.reason).toContain('Drama shows require approval')
    })

    it('should not trigger approval for non-matching genres', async () => {
      const movieContext: RoutingContext = {
        userId: 1,
        userName: 'Test User',
        contentType: 'movie',
        itemKey: 'test-comedy-key',
      }

      const checkApproval = getCheckApproval()

      // Comedy movie should not trigger Drama approval rules
      const result = await checkApproval(comedyMovie, movieContext, [])
      expect(result.required).toBe(false)
    })

    it('should not trigger disabled rules', async () => {
      const knex = getTestDatabase()

      // Disable all rules except rule 3 (which is already disabled)
      await knex('router_rules').where('id', 1).update({ enabled: false })
      await knex('router_rules').where('id', 2).update({ enabled: false })
      fastify.contentRouter.clearRouterRulesCache()

      const movieContext: RoutingContext = {
        userId: 1,
        userName: 'Test User',
        contentType: 'movie',
        itemKey: 'test-movie-key',
      }

      const checkApproval = getCheckApproval()

      // No enabled rules should match
      const result = await checkApproval(dramaMovie, movieContext, [])
      expect(result.required).toBe(false)
    })
  })

  describe('evaluator loading', () => {
    it('should load evaluators with correct methods', async () => {
      // The service should have loaded evaluators during initialization
      // Access the evaluators array to verify they loaded
      const evaluators = (
        fastify.contentRouter as unknown as { evaluators: unknown[] }
      ).evaluators

      expect(evaluators.length).toBeGreaterThan(0)

      // Verify conditional evaluator is loaded with evaluate() method
      const conditionalEvaluator = evaluators.find(
        (e: unknown) =>
          typeof e === 'object' &&
          e !== null &&
          'name' in e &&
          (e as { name: string }).name === 'Conditional Router',
      ) as { name: string; evaluate?: unknown } | undefined

      expect(conditionalEvaluator).toBeDefined()
      expect(typeof conditionalEvaluator?.evaluate).toBe('function')

      // Verify field evaluators are loaded with evaluateCondition() method
      const genreEvaluator = evaluators.find(
        (e: unknown) =>
          typeof e === 'object' &&
          e !== null &&
          'name' in e &&
          (e as { name: string }).name === 'Genre Router',
      ) as { name: string; evaluateCondition?: unknown } | undefined

      expect(genreEvaluator).toBeDefined()
      expect(typeof genreEvaluator?.evaluateCondition).toBe('function')
    })
  })
})
