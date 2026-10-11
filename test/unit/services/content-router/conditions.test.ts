import type { RadarrMovieLookupResponse } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  RoutingContext,
} from '@root/types/router.types.js'
import {
  evaluateCondition,
  evaluateLeaf,
} from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  bareItem,
  type LeafCase,
  movie,
} from '../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../mocks/logger.js'

const throwingItem: ContentItem = {
  title: 'Broken Movie',
  type: 'movie',
  guids: ['tmdb:2'],
  get genres(): string[] {
    throw new Error('genres unavailable')
  },
}

const cases: LeafCase[] = [
  {
    name: 'an unknown field is unevaluated',
    condition: { field: 'unknownField', operator: 'equals', value: 1 },
    item: movie(),
    expected: null,
  },
  {
    name: 'an inherited object key is not a field',
    condition: { field: 'toString', operator: 'equals', value: 1 },
    item: movie(),
    expected: null,
  },
  {
    name: 'a throwing evaluator is unevaluated',
    condition: { field: 'genres', operator: 'contains', value: 'Drama' },
    item: throwingItem,
    expected: null,
  },
  {
    name: 'an operator the field does not allow is unevaluated',
    condition: { field: 'year', operator: 'contains', value: 2020 },
    item: movie(),
    expected: null,
  },
  {
    name: 'missing data is unevaluated',
    condition: { field: 'year', operator: 'equals', value: 2020 },
    item: bareItem,
    expected: null,
  },
  {
    name: 'a wrong value shape is false',
    condition: { field: 'year', operator: 'equals', value: [2020] },
    item: movie(),
    expected: false,
  },
  {
    name: 'a matching condition is true',
    condition: { field: 'year', operator: 'equals', value: 2020 },
    item: movie(),
    expected: true,
  },
]

describe('evaluateLeaf', () => {
  it.each(cases)('$name', ({ condition, item, context, expected }) => {
    expect(
      evaluateLeaf(
        condition,
        item,
        { ...BASE_CONTEXT, ...context },
        createMockLogger(),
      ),
    ).toBe(expected)
  })
})

describe('evaluateCondition', () => {
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

  const log = createMockLogger()

  it('returns false for a negated unknown field', () => {
    expect(
      evaluateCondition({ ...unknown, negate: true }, item, context, log),
    ).toBe(false)
  })

  it('returns false for a negated condition whose evaluator throws', () => {
    const result = evaluateCondition(
      { field: 'genres', operator: 'contains', value: 'Drama', negate: true },
      throwingItem,
      context,
      log,
    )
    expect(result).toBe(false)
  })

  it('returns false for a negated empty AND group', () => {
    const result = evaluateCondition(
      { operator: 'AND', conditions: [], negate: true },
      item,
      context,
      log,
    )
    expect(result).toBe(false)
  })

  it('returns false for a negated group whose only child cannot be evaluated', () => {
    const result = evaluateCondition(
      { operator: 'AND', conditions: [unknown], negate: true },
      item,
      context,
      log,
    )
    expect(result).toBe(false)
  })

  it('still negates an evaluator that returns false', () => {
    expect(
      evaluateCondition({ ...missesYear, negate: true }, item, context, log),
    ).toBe(true)
  })

  it('agrees on both spellings of not-equals for an item with no year', () => {
    const bare: ContentItem = { title: 'Bare', type: 'movie', guids: [] }
    expect(
      evaluateCondition({ ...matchesYear, negate: true }, bare, context, log),
    ).toBe(false)
    expect(
      evaluateCondition(
        { ...matchesYear, operator: 'notEquals' },
        bare,
        context,
        log,
      ),
    ).toBe(false)
  })

  it('returns false for a negated operator the field does not allow', () => {
    const result = evaluateCondition(
      { field: 'year', operator: 'contains', value: 2020, negate: true },
      item,
      context,
      log,
    )
    expect(result).toBe(false)
  })

  it('returns false for a negated unsafe regex', () => {
    const result = evaluateCondition(
      // codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
      { field: 'genres', operator: 'regex', value: '(a+)+$', negate: true },
      item,
      context,
      log,
    )
    expect(result).toBe(false)
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
      expect(evaluateCondition(group, item, context, log)).toBe(plain)
      expect(
        evaluateCondition({ ...group, negate: true }, item, context, log),
      ).toBe(negated)
    },
  )
})
