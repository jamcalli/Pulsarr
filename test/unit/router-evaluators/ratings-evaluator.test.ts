import createRatingsEvaluator from '@root/router-evaluators/ratings-evaluator.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('ratings-evaluator', () => {
  let evaluator: ReturnType<typeof createRatingsEvaluator>

  const context: RoutingContext = {
    userId: 1,
    userName: 'User 1',
    contentType: 'movie',
    itemKey: 'test-key',
  }

  const movie = (overrides: Partial<ContentItem> = {}): ContentItem => ({
    title: 'Test Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    genres: ['Comedy'],
    ...overrides,
  })

  const evaluate = (condition: Condition, item: ContentItem): boolean =>
    evaluator.evaluateCondition?.(condition, item, context) ?? false

  beforeEach(() => {
    evaluator = createRatingsEvaluator({
      log: createMockLogger(),
    } as unknown as FastifyInstance)
  })

  describe('IMDb compound vote count', () => {
    const ratingValues: Array<[Condition['operator'], unknown]> = [
      ['greaterThan', 7],
      ['lessThan', 9],
      ['equals', 8],
      ['between', { min: 7, max: 9 }],
      ['in', [8]],
      ['notIn', [5]],
    ]

    describe.each(ratingValues)('with %s on the rating', (operator, rating) => {
      const withVotes = (votes: number) => movie({ imdb: { rating: 8, votes } })
      const condition: Condition = {
        field: 'imdbRating',
        operator,
        value: { rating, votes: 1000 },
      }

      it('matches when the vote count is exactly N', () => {
        expect(evaluate(condition, withVotes(1000))).toBe(true)
      })

      it('matches when the vote count is above N', () => {
        expect(evaluate(condition, withVotes(5000))).toBe(true)
      })

      it('does not match when the vote count is below N', () => {
        expect(evaluate(condition, withVotes(999))).toBe(false)
      })
    })

    it('treats a votes-only value as at least N votes', () => {
      const condition: Condition = {
        field: 'imdbRating',
        operator: 'lessThan',
        value: { votes: 1000 },
      }
      expect(
        evaluate(condition, movie({ imdb: { rating: 8, votes: 1000 } })),
      ).toBe(true)
      expect(
        evaluate(condition, movie({ imdb: { rating: 8, votes: 10 } })),
      ).toBe(false)
    })

    it('rejects a non-number votes value', () => {
      const item = movie({ imdb: { rating: 8, votes: 5000 } })
      expect(
        evaluate(
          {
            field: 'imdbRating',
            operator: 'in',
            value: { rating: [8], votes: [5000] },
          },
          item,
        ),
      ).toBe(false)
      expect(
        evaluate(
          {
            field: 'imdbRating',
            operator: 'between',
            value: { rating: { min: 7 }, votes: { min: 1000 } },
          },
          item,
        ),
      ).toBe(false)
    })
  })

  describe('Rotten Tomatoes scale conversion', () => {
    it.each([87, 85, 70, 33])('equals %i matches the stored tenth', (score) => {
      const item = movie({ rtCritic: score / 10 })
      expect(
        evaluate(
          { field: 'rtCriticRating', operator: 'equals', value: score },
          item,
        ),
      ).toBe(true)
    })

    it.each([87, 85, 70, 33])('in [%i] matches the stored tenth', (score) => {
      const item = movie({ rtAudience: score / 10 })
      expect(
        evaluate(
          { field: 'rtAudienceRating', operator: 'in', value: [score] },
          item,
        ),
      ).toBe(true)
    })

    it('between 70 and 87 includes both bounds', () => {
      const condition: Condition = {
        field: 'rtCriticRating',
        operator: 'between',
        value: { min: 70, max: 87 },
      }
      expect(evaluate(condition, movie({ rtCritic: 8.7 }))).toBe(true)
      expect(evaluate(condition, movie({ rtCritic: 7 }))).toBe(true)
      expect(evaluate(condition, movie({ rtCritic: 8.8 }))).toBe(false)
      expect(evaluate(condition, movie({ rtCritic: 6.9 }))).toBe(false)
    })

    it('a lower bound of 87 includes a stored 8.7', () => {
      const condition: Condition = {
        field: 'rtCriticRating',
        operator: 'between',
        value: { min: 87 },
      }
      expect(evaluate(condition, movie({ rtCritic: 8.7 }))).toBe(true)
    })
  })
})
