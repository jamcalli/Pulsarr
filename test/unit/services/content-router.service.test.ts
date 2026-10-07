import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  RouterRule,
  RoutingContext,
} from '@root/types/router.types.js'
import { ContentRouterService } from '@services/content-router.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { FastifyInstance } from 'fastify'
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('ContentRouterService.getAllRouterRules', () => {
  let getAllRouterRules: Mock<DatabaseService['getAllRouterRules']>
  let router: ContentRouterService

  beforeEach(() => {
    getAllRouterRules = vi.fn<DatabaseService['getAllRouterRules']>()
    const db: Partial<DatabaseService> = { getAllRouterRules }
    const fastify: Partial<FastifyInstance> = { db: db as DatabaseService }
    router = new ContentRouterService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
  })

  it('does not cache a fetch that resolves after the cache was cleared', async () => {
    let resolveStale: (rules: RouterRule[]) => void = () => {}
    getAllRouterRules
      .mockImplementationOnce(
        () =>
          new Promise<RouterRule[]>((resolve) => {
            resolveStale = resolve
          }),
      )
      .mockResolvedValueOnce([])

    const stale = router.getAllRouterRules()
    router.clearRouterRulesCache()
    resolveStale([])
    await stale

    expect(await router.getAllRouterRules()).toEqual([])
    expect(getAllRouterRules).toHaveBeenCalledTimes(2)
  })
})

describe('ContentRouterService.evaluateCondition', () => {
  const metadata: RadarrMovieLookupResponse = {
    id: 1,
    tmdbId: 1,
    title: 'Test Movie',
    year: 2020,
  }
  const item: ContentItem = {
    title: 'Test Movie',
    type: 'movie',
    guids: ['tmdb:1'],
    genres: ['Drama'],
    metadata,
  }
  const throwingItem: ContentItem = {
    title: 'Broken Movie',
    type: 'movie',
    guids: ['tmdb:2'],
    get genres(): string[] {
      throw new Error('genres unavailable')
    },
  }
  const context: RoutingContext = {
    userId: 1,
    contentType: 'movie',
    itemKey: 'test-key',
  }

  const matchesYear: Condition = {
    field: 'year',
    operator: 'equals',
    value: 2020,
  }
  const missesYear: Condition = {
    field: 'year',
    operator: 'equals',
    value: 1999,
  }
  const unknown: Condition = {
    field: 'unknownField',
    operator: 'equals',
    value: 1,
  }

  let router: ContentRouterService

  beforeAll(async () => {
    const fastify: Partial<FastifyInstance> = { log: createMockLogger() }
    router = new ContentRouterService(
      createMockLogger(),
      fastify as FastifyInstance,
    )
    await router.initialize()
  })

  it('returns false for a negated unknown field', () => {
    expect(
      router.evaluateCondition({ ...unknown, negate: true }, item, context),
    ).toBe(false)
  })

  it('returns false for a negated condition whose evaluator throws', () => {
    const result = router.evaluateCondition(
      { field: 'genres', operator: 'contains', value: 'Drama', negate: true },
      throwingItem,
      context,
    )
    expect(result).toBe(false)
  })

  it('returns false for a negated empty AND group', () => {
    const result = router.evaluateCondition(
      { operator: 'AND', conditions: [], negate: true },
      item,
      context,
    )
    expect(result).toBe(false)
  })

  it('returns false for a negated group whose only child cannot be evaluated', () => {
    const result = router.evaluateCondition(
      { operator: 'AND', conditions: [unknown], negate: true },
      item,
      context,
    )
    expect(result).toBe(false)
  })

  it('still negates an evaluator that returns false', () => {
    expect(
      router.evaluateCondition({ ...missesYear, negate: true }, item, context),
    ).toBe(true)
  })

  it.each([
    ['AND(true, unknown)', 'AND', [matchesYear, unknown], false, false],
    ['OR(false, unknown)', 'OR', [missesYear, unknown], false, false],
    ['AND(false, unknown)', 'AND', [missesYear, unknown], false, true],
    ['OR(true, unknown)', 'OR', [matchesYear, unknown], true, false],
  ] as const)(
    'evaluates %s with three-valued logic',
    (_label, operator, conditions, plain, negated) => {
      const group = { operator, conditions: [...conditions] }
      expect(router.evaluateCondition(group, item, context)).toBe(plain)
      expect(
        router.evaluateCondition({ ...group, negate: true }, item, context),
      ).toBe(negated)
    },
  )
})
