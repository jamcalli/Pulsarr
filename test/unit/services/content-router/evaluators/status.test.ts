import { evaluateLeaf } from '@services/content-router/conditions.js'
import { describe, expect, it } from 'vitest'
import {
  BASE_CONTEXT,
  type LeafCase,
  movie,
  SHOW_CONTEXT,
  show,
} from '../../../../mocks/content-router-items.js'
import { createMockLogger } from '../../../../mocks/logger.js'

const released = movie({}, { status: 'released' })
const continuing = show({}, { status: 'continuing' })

const cases: LeafCase[] = [
  {
    name: 'movie status equals folds case',
    condition: { field: 'movieStatus', operator: 'equals', value: 'Released' },
    item: released,
    expected: true,
  },
  {
    name: 'movie status notEquals matches another status',
    condition: { field: 'movieStatus', operator: 'notEquals', value: 'tba' },
    item: released,
    expected: true,
  },
  {
    name: 'movie status in matches a listed status',
    condition: {
      field: 'movieStatus',
      operator: 'in',
      value: ['tba', 'RELEASED'],
    },
    item: released,
    expected: true,
  },
  {
    name: 'movie status in rejects a mixed array',
    condition: { field: 'movieStatus', operator: 'in', value: ['released', 5] },
    item: released,
    expected: false,
  },
  {
    name: 'movie status notIn rejects a mixed array',
    condition: { field: 'movieStatus', operator: 'notIn', value: ['tba', 5] },
    item: released,
    expected: false,
  },
  {
    name: 'movie status under a show context is missing data',
    condition: { field: 'movieStatus', operator: 'notEquals', value: 'tba' },
    item: released,
    context: SHOW_CONTEXT,
    expected: null,
  },
  {
    name: 'series status equals matches',
    condition: {
      field: 'seriesStatus',
      operator: 'equals',
      value: 'continuing',
    },
    item: continuing,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'series status notIn matches an unlisted status',
    condition: { field: 'seriesStatus', operator: 'notIn', value: ['ended'] },
    item: continuing,
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'series status on movie metadata is missing data',
    condition: { field: 'seriesStatus', operator: 'notEquals', value: 'ended' },
    item: released,
    context: SHOW_CONTEXT,
    expected: null,
  },
  {
    name: 'series status under a movie context is missing data',
    condition: {
      field: 'seriesStatus',
      operator: 'equals',
      value: 'continuing',
    },
    item: continuing,
    expected: null,
  },
]

describe('status field', () => {
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
