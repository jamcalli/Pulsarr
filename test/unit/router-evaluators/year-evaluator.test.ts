import createYearEvaluator from '@root/router-evaluators/year-evaluator.js'
import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('year-evaluator', () => {
  let evaluator: ReturnType<typeof createYearEvaluator>

  const context: RoutingContext = {
    userId: 1,
    userName: 'User 1',
    contentType: 'movie',
    itemKey: 'test-key',
  }

  const metadata: RadarrMovieLookupResponse = {
    id: 99999,
    tmdbId: 99999,
    title: 'Test Comedy Movie',
    year: 2020,
  }

  const movie: ContentItem = {
    title: 'Test Comedy Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    genres: ['Comedy'],
    metadata,
  }

  const evaluate = (condition: Condition): boolean =>
    evaluator.evaluateCondition?.(condition, movie, context) ?? false

  beforeEach(() => {
    evaluator = createYearEvaluator({
      log: createMockLogger(),
    } as unknown as FastifyInstance)
  })

  describe('numeric strings', () => {
    it('equals "2020" matches 2020', () => {
      expect(
        evaluate({ field: 'year', operator: 'equals', value: '2020' }),
      ).toBe(true)
    })

    it('equals "2019" does not match 2020', () => {
      expect(
        evaluate({ field: 'year', operator: 'equals', value: '2019' }),
      ).toBe(false)
    })

    it('in ["2019", "2020"] matches 2020', () => {
      expect(
        evaluate({ field: 'year', operator: 'in', value: ['2019', '2020'] }),
      ).toBe(true)
    })

    it.each([['2020.5'], ['abc'], [''], [' ']])('rejects %j', (value) => {
      expect(evaluate({ field: 'year', operator: 'equals', value })).toBe(false)
      expect(evaluate({ field: 'year', operator: 'notEquals', value })).toBe(
        false,
      )
    })
  })
})
