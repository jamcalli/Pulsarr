import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  bareItem,
  type LeafCase,
  movie,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const onLists = movie({ listMemberships: new Set(['favorites', 'kids picks']) })

const cases: LeafCase[] = [
  {
    name: 'equals is membership after folding the value',
    condition: { field: 'plexList', operator: 'equals', value: ' Favorites ' },
    item: onLists,
    expected: true,
  },
  {
    name: 'notEquals rejects a member list',
    condition: { field: 'plexList', operator: 'notEquals', value: 'favorites' },
    item: onLists,
    expected: false,
  },
  {
    name: 'contains matches a list name substring',
    condition: { field: 'plexList', operator: 'contains', value: 'kid' },
    item: onLists,
    expected: true,
  },
  {
    name: 'notContains matches when no list name has the substring',
    condition: { field: 'plexList', operator: 'notContains', value: 'horror' },
    item: onLists,
    expected: true,
  },
  {
    name: 'a non-string value is rejected',
    condition: { field: 'plexList', operator: 'equals', value: ['favorites'] },
    item: onLists,
    expected: false,
  },
  {
    name: 'an empty membership set is present data',
    condition: { field: 'plexList', operator: 'notContains', value: 'kid' },
    item: movie({ listMemberships: new Set() }),
    expected: true,
  },
  {
    name: 'unfetched memberships are missing data',
    condition: { field: 'plexList', operator: 'notContains', value: 'kid' },
    item: bareItem,
    expected: null,
  },
]

describe('plexList field', () => {
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
