import createUserEvaluator from '@root/router-evaluators/user-evaluator.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

describe('user-evaluator', () => {
  let evaluator: ReturnType<typeof createUserEvaluator>

  const item: ContentItem = {
    title: 'Test Comedy Movie',
    type: 'movie',
    guids: ['imdb:tt9999999', 'tmdb:99999'],
    genres: ['Comedy'],
  }

  const evaluate = (condition: Condition, userId: number, userName?: string) =>
    evaluator.evaluateCondition?.(condition, item, {
      userId,
      userName: userName ?? `User ${userId}`,
      contentType: 'movie',
      itemKey: 'test-key',
    } satisfies RoutingContext) ?? false

  beforeEach(() => {
    evaluator = createUserEvaluator({
      log: createMockLogger(),
    } as unknown as FastifyInstance)
  })

  describe('equals with an array value', () => {
    const condition: Condition = {
      field: 'user',
      operator: 'equals',
      value: ['5', '7'],
    }

    it('matches a user in the array', () => {
      expect(evaluate(condition, 5)).toBe(true)
    })

    it('does not match a user outside the array', () => {
      expect(evaluate(condition, 9)).toBe(false)
    })

    it('matches a one-element array', () => {
      expect(
        evaluate({ field: 'user', operator: 'equals', value: ['5'] }, 5),
      ).toBe(true)
    })

    it('matches names in mixed case', () => {
      expect(
        evaluate(
          { field: 'user', operator: 'equals', value: ['AdMin', 'Guest'] },
          9,
          'admin',
        ),
      ).toBe(true)
    })
  })

  describe('notEquals with an array value', () => {
    const condition: Condition = {
      field: 'user',
      operator: 'notEquals',
      value: ['5', '7'],
    }

    it('does not match a user in the array', () => {
      expect(evaluate(condition, 5)).toBe(false)
    })

    it('matches a user outside the array', () => {
      expect(evaluate(condition, 9)).toBe(true)
    })

    it('does not match a one-element array holding the user', () => {
      expect(
        evaluate({ field: 'user', operator: 'notEquals', value: ['5'] }, 5),
      ).toBe(false)
    })

    it('does not match names in mixed case', () => {
      expect(
        evaluate(
          { field: 'user', operator: 'notEquals', value: ['AdMin', 'Guest'] },
          9,
          'admin',
        ),
      ).toBe(false)
    })
  })

  describe('regex', () => {
    it('matches a lowercase pattern against a mixed-case name', () => {
      expect(
        evaluate(
          { field: 'user', operator: 'regex', value: '^admin$' },
          9,
          'AdMin',
        ),
      ).toBe(true)
    })

    it('does not match an unsafe pattern', () => {
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
      const unsafePattern = '(a+)+$'
      expect(
        evaluate(
          { field: 'user', operator: 'regex', value: unsafePattern },
          9,
          'aaaa',
        ),
      ).toBe(false)
    })
  })
})
