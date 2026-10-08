import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import {
  compareEnum,
  compareIdentity,
  compareText,
  compareTextSet,
  foldLower,
  foldUpper,
  matchesRegex,
} from '@services/content-router/evaluators/text.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

type TextCase = [ComparisonOperator, unknown, boolean | null]

// codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
const UNSAFE_PATTERN = '(a+)+$'

describe('matchesRegex', () => {
  it.each([
    ['^tv', 'TV-MA', true],
    ['^TV', 'tv-ma', true],
    ['^ma', 'TV-MA', false],
    [UNSAFE_PATTERN, 'aaaa', null],
    ['[', 'anything', null],
    [5, '5', false],
  ])('%j against %j is %j', (pattern, subject, expected) => {
    expect(matchesRegex(pattern, subject, createMockLogger(), 'test')).toBe(
      expected,
    )
  })

  it('matches when any subject matches', () => {
    expect(
      matchesRegex('^dra', ['Action', 'Drama'], createMockLogger(), 'test'),
    ).toBe(true)
  })
})

describe('compareText', () => {
  const cases: TextCase[] = [
    ['equals', 'tv-ma', true],
    ['equals', 'TV-14', false],
    ['notEquals', 'TV-14', true],
    ['notEquals', 5, false],
    ['contains', 'ma', true],
    ['notContains', 'pg', true],
    ['in', ['R', 'tv-ma'], true],
    ['in', ['tv-ma', 5], true],
    ['in', 'tv-ma', false],
    ['notIn', ['R', 5], true],
    ['notIn', ['TV-MA'], false],
    ['regex', '^tv-', true],
    ['between', 'tv-ma', false],
  ]

  it.each(cases)('Tv-Ma %s %j is %j', (operator, value, expected) => {
    expect(
      compareText('Tv-Ma', operator, value, foldUpper, createMockLogger(), 'x'),
    ).toBe(expected)
  })

  it('folds both sides with the given fold', () => {
    expect(
      compareText(
        'English',
        'equals',
        'ENGLISH',
        foldLower,
        createMockLogger(),
        'x',
      ),
    ).toBe(true)
  })
})

describe('compareEnum', () => {
  const cases: TextCase[] = [
    ['equals', 'Released', true],
    ['notEquals', 'tba', true],
    ['in', ['tba', 'RELEASED'], true],
    ['in', ['released', 5], false],
    ['notIn', ['released', 5], false],
    ['notIn', ['tba'], true],
    ['contains', 'rel', false],
  ]

  it.each(cases)('released %s %j is %j', (operator, value, expected) => {
    expect(compareEnum('released', operator, value)).toBe(expected)
  })
})

describe('compareTextSet', () => {
  const cases: TextCase[] = [
    ['contains', ' action ', true],
    ['contains', ['Horror', 'drama'], true],
    ['in', 'Drama', true],
    ['in', ['Horror'], false],
    ['notContains', 'Horror', true],
    ['notIn', ['action'], false],
    ['equals', ['drama', 'ACTION'], true],
    ['equals', ['Action'], false],
    ['equals', 'Action', false],
    ['regex', '^Dra', true],
    ['notEquals', 'Action', false],
  ]

  it.each(cases)('[Action, Drama] %s %j is %j', (operator, value, expected) => {
    expect(
      compareTextSet(
        ['Action', 'Drama'],
        operator,
        value,
        createMockLogger(),
        'x',
      ),
    ).toBe(expected)
  })

  it('equals a single genre only when the item has one genre', () => {
    expect(
      compareTextSet(['Action'], 'equals', 'action', createMockLogger(), 'x'),
    ).toBe(true)
  })
})

describe('compareIdentity', () => {
  const identity = { userId: 42, userName: 'Alice' }
  const cases: TextCase[] = [
    ['equals', 42, true],
    ['equals', '42', true],
    ['equals', 'ALICE', true],
    ['equals', 'bob', false],
    ['equals', ['bob', 42], true],
    ['notEquals', 'bob', true],
    ['notEquals', ['alice'], false],
    ['in', ['bob', 'alice'], true],
    ['in', 42, true],
    ['notIn', [7], true],
    ['notIn', 'alice', false],
    ['regex', '^ali', true],
    ['regex', UNSAFE_PATTERN, null],
    ['contains', 'ali', false],
  ]

  it.each(cases)('Alice (42) %s %j is %j', (operator, value, expected) => {
    expect(
      compareIdentity(identity, operator, value, createMockLogger(), 'x'),
    ).toBe(expected)
  })

  it('never matches a regex without a user name', () => {
    expect(
      compareIdentity(
        { userId: 42, userName: undefined },
        'regex',
        '.*',
        createMockLogger(),
        'x',
      ),
    ).toBe(false)
  })
})
