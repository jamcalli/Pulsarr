import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  bareItem,
  type LeafCase,
  movie,
  SHOW_CONTEXT,
  show,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const rated = movie({}, { certification: 'Tv-Ma' })

const cases: LeafCase[] = [
  {
    name: 'regex matches a lowercase pattern against a mixed-case certification',
    condition: { field: 'certification', operator: 'regex', value: '^tv-ma$' },
    item: rated,
    expected: true,
  },
  {
    name: 'equals folds case',
    condition: { field: 'certification', operator: 'equals', value: 'TV-MA' },
    item: rated,
    expected: true,
  },
  {
    name: 'notEquals rejects the same certification',
    condition: {
      field: 'certification',
      operator: 'notEquals',
      value: 'tv-ma',
    },
    item: rated,
    expected: false,
  },
  {
    name: 'contains matches a substring',
    condition: { field: 'certification', operator: 'contains', value: 'ma' },
    item: rated,
    expected: true,
  },
  {
    name: 'notContains matches an absent substring',
    condition: { field: 'certification', operator: 'notContains', value: 'pg' },
    item: rated,
    expected: true,
  },
  {
    name: 'in skips non-string members',
    condition: { field: 'certification', operator: 'in', value: ['tv-ma', 5] },
    item: rated,
    expected: true,
  },
  {
    name: 'notIn rejects a listed certification',
    condition: { field: 'certification', operator: 'notIn', value: ['TV-MA'] },
    item: rated,
    expected: false,
  },
  {
    name: 'a show certification is read too',
    condition: { field: 'certification', operator: 'equals', value: 'tv-14' },
    item: show({}, { certification: 'TV-14' }),
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'an empty certification is missing data',
    condition: { field: 'certification', operator: 'notEquals', value: 'R' },
    item: movie({}, { certification: '' }),
    expected: null,
  },
  {
    name: 'missing metadata is unevaluated',
    condition: { field: 'certification', operator: 'notEquals', value: 'R' },
    item: bareItem,
    expected: null,
  },
]

describe('certification field', () => {
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
