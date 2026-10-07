import createGenreEvaluator from '@root/router-evaluators/genre-evaluator.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('genre-evaluator', () => {
  let evaluator: ReturnType<typeof createGenreEvaluator>

  const context: RoutingContext = {
    userId: 1,
    userName: 'User 1',
    contentType: 'movie',
    itemKey: 'test-key',
  }

  const actionMovie: ContentItem = {
    title: 'Test Action Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    genres: ['Action'],
  }

  const evaluate = (condition: Condition): boolean =>
    evaluator.evaluateCondition?.(condition, actionMovie, context) ?? false

  beforeEach(() => {
    evaluator = createGenreEvaluator({
      log: createMockLogger(),
    } as unknown as FastifyInstance)
  })

  describe('regex', () => {
    it('matches against the original genre casing', () => {
      expect(
        evaluate({ field: 'genres', operator: 'regex', value: '^Action$' }),
      ).toBe(true)
    })

    it('matches a lowercased pattern', () => {
      expect(
        evaluate({ field: 'genres', operator: 'regex', value: '^action$' }),
      ).toBe(true)
    })
  })

  describe('contains', () => {
    it('stays case-insensitive', () => {
      expect(
        evaluate({ field: 'genres', operator: 'contains', value: 'aCTION' }),
      ).toBe(true)
    })
  })
})
