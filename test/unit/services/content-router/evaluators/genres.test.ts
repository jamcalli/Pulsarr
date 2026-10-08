import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  bareItem,
  type LeafCase,
  movie,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const actionDrama = movie({ genres: ['Action', 'Drama'] })
const action = movie({ genres: ['Action'] })

const cases: LeafCase[] = [
  {
    name: 'regex matches the original genre casing',
    condition: { field: 'genres', operator: 'regex', value: '^Action$' },
    item: action,
    expected: true,
  },
  {
    name: 'regex matches a lowercased pattern',
    condition: { field: 'genres', operator: 'regex', value: '^action$' },
    item: action,
    expected: true,
  },
  {
    name: 'contains stays case-insensitive',
    condition: { field: 'genres', operator: 'contains', value: 'aCTION' },
    item: action,
    expected: true,
  },
  {
    name: 'contains accepts a list',
    condition: {
      field: 'genres',
      operator: 'contains',
      value: ['Horror', 'drama'],
    },
    item: actionDrama,
    expected: true,
  },
  {
    name: 'in matches one listed genre',
    condition: { field: 'genres', operator: 'in', value: ['Drama'] },
    item: actionDrama,
    expected: true,
  },
  {
    name: 'notContains rejects a present genre',
    condition: { field: 'genres', operator: 'notContains', value: 'drama' },
    item: actionDrama,
    expected: false,
  },
  {
    name: 'notIn matches when no genre is listed',
    condition: { field: 'genres', operator: 'notIn', value: ['Horror'] },
    item: actionDrama,
    expected: true,
  },
  {
    name: 'equals is set equality',
    condition: {
      field: 'genres',
      operator: 'equals',
      value: ['drama', 'ACTION'],
    },
    item: actionDrama,
    expected: true,
  },
  {
    name: 'equals rejects a subset',
    condition: { field: 'genres', operator: 'equals', value: ['Action'] },
    item: actionDrama,
    expected: false,
  },
  {
    name: 'equals with one genre needs a one-genre item',
    condition: { field: 'genres', operator: 'equals', value: 'action' },
    item: action,
    expected: true,
  },
  {
    name: 'a mixed array is the wrong shape',
    condition: { field: 'genres', operator: 'in', value: ['Action', 5] },
    item: action,
    expected: false,
  },
  {
    name: 'an empty genre list is missing data',
    condition: { field: 'genres', operator: 'notContains', value: 'Horror' },
    item: movie({ genres: [] }),
    expected: null,
  },
  {
    name: 'no genres is missing data',
    condition: { field: 'genres', operator: 'contains', value: 'Action' },
    item: bareItem,
    expected: null,
  },
]

describe('genres field', () => {
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
