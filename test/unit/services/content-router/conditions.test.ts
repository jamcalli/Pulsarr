import type { ContentItem } from '@root/types/router.types.js'
import { evaluateLeaf } from '@services/content-router/conditions.js'
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
