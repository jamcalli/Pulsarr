import createLanguageEvaluator from '@root/router-evaluators/language-evaluator.js'
import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('language-evaluator', () => {
  let evaluator: ReturnType<typeof createLanguageEvaluator>

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
    originalLanguage: { id: 1, name: 'English' },
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
    evaluator = createLanguageEvaluator({
      log: createMockLogger(),
    } as unknown as FastifyInstance)
  })

  describe('regex', () => {
    it('matches a lowercase pattern against a mixed-case language', () => {
      expect(
        evaluate({
          field: 'language',
          operator: 'regex',
          value: '^english$',
        }),
      ).toBe(true)
    })
  })
})
