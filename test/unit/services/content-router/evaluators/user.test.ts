import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  type LeafCase,
  movie,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const item = movie()
const asUser = (userId: number, userName = `User ${userId}`) => ({
  userId,
  userName,
})

// codeql[js/polynomial-redos] - Intentionally unsafe pattern for testing
const UNSAFE_PATTERN = '(a+)+$'

const cases: LeafCase[] = [
  {
    name: 'equals with an array matches a listed user',
    condition: { field: 'user', operator: 'equals', value: ['5', '7'] },
    item,
    context: asUser(5),
    expected: true,
  },
  {
    name: 'equals with an array rejects an unlisted user',
    condition: { field: 'user', operator: 'equals', value: ['5', '7'] },
    item,
    context: asUser(9),
    expected: false,
  },
  {
    name: 'equals with a one-element array matches',
    condition: { field: 'user', operator: 'equals', value: ['5'] },
    item,
    context: asUser(5),
    expected: true,
  },
  {
    name: 'equals with an array folds names',
    condition: { field: 'user', operator: 'equals', value: ['AdMin', 'Guest'] },
    item,
    context: asUser(9, 'admin'),
    expected: true,
  },
  {
    name: 'notEquals with an array rejects a listed user',
    condition: { field: 'user', operator: 'notEquals', value: ['5', '7'] },
    item,
    context: asUser(5),
    expected: false,
  },
  {
    name: 'notEquals with an array matches an unlisted user',
    condition: { field: 'user', operator: 'notEquals', value: ['5', '7'] },
    item,
    context: asUser(9),
    expected: true,
  },
  {
    name: 'notEquals with a one-element array rejects the user',
    condition: { field: 'user', operator: 'notEquals', value: ['5'] },
    item,
    context: asUser(5),
    expected: false,
  },
  {
    name: 'notEquals with an array folds names',
    condition: {
      field: 'user',
      operator: 'notEquals',
      value: ['AdMin', 'Guest'],
    },
    item,
    context: asUser(9, 'admin'),
    expected: false,
  },
  {
    name: 'equals matches a numeric id',
    condition: { field: 'user', operator: 'equals', value: 5 },
    item,
    context: asUser(5),
    expected: true,
  },
  {
    name: 'in wraps a scalar value',
    condition: { field: 'user', operator: 'in', value: 'user 5' },
    item,
    context: asUser(5),
    expected: true,
  },
  {
    name: 'regex matches a lowercase pattern against a mixed-case name',
    condition: { field: 'user', operator: 'regex', value: '^admin$' },
    item,
    context: asUser(9, 'AdMin'),
    expected: true,
  },
  {
    name: 'an unsafe regex is unevaluated',
    condition: { field: 'user', operator: 'regex', value: UNSAFE_PATTERN },
    item,
    context: asUser(9, 'aaaa'),
    expected: null,
  },
  {
    name: 'no user id or name is missing data',
    condition: { field: 'user', operator: 'notEquals', value: 'admin' },
    item,
    context: { userId: 0, userName: undefined },
    expected: null,
  },
]

describe('user field', () => {
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
