import type { ContentItem } from '@root/types/router.types.js'
import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  type LeafCase,
  SHOW_CONTEXT,
  show,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const threeSeasons: ContentItem = show(
  {},
  {
    seasons: [1, 2, 3].map((seasonNumber) => ({
      seasonNumber,
      monitored: true,
    })),
  },
)

const cases: LeafCase[] = [
  {
    name: 'equals matches any season',
    condition: { field: 'season', operator: 'equals', value: 2 },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'notEquals rejects a present season',
    condition: { field: 'season', operator: 'notEquals', value: 2 },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: false,
  },
  {
    name: 'notEquals matches an absent season',
    condition: { field: 'season', operator: 'notEquals', value: 9 },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'greaterThan matches when any season is above',
    condition: { field: 'season', operator: 'greaterThan', value: 2 },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'lessThan fails when no season is below',
    condition: { field: 'season', operator: 'lessThan', value: 1 },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: false,
  },
  {
    name: 'in matches any listed season',
    condition: { field: 'season', operator: 'in', value: [3, 9] },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'notIn rejects when any season is listed',
    condition: { field: 'season', operator: 'notIn', value: [1, 9] },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: false,
  },
  {
    name: 'between matches an overlapping range',
    condition: {
      field: 'season',
      operator: 'between',
      value: { min: 3, max: 5 },
    },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'between swaps a reversed range',
    condition: {
      field: 'season',
      operator: 'between',
      value: { min: 5, max: 3 },
    },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'between with an empty range never matches',
    condition: { field: 'season', operator: 'between', value: {} },
    item: threeSeasons,
    context: SHOW_CONTEXT,
    expected: false,
  },
  {
    name: 'a movie context is missing data',
    condition: { field: 'season', operator: 'equals', value: 2 },
    item: threeSeasons,
    expected: null,
  },
  {
    name: 'an empty seasons list is missing data',
    condition: { field: 'season', operator: 'equals', value: 2 },
    item: show(),
    context: SHOW_CONTEXT,
    expected: null,
  },
]

describe('season field', () => {
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
