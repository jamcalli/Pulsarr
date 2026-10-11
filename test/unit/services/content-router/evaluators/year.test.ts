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

const in2020 = movie()

const cases: LeafCase[] = [
  {
    name: 'equals matches the release year',
    condition: { field: 'year', operator: 'equals', value: 2020 },
    item: in2020,
    expected: true,
  },
  {
    name: 'notEquals rejects the release year',
    condition: { field: 'year', operator: 'notEquals', value: 2020 },
    item: in2020,
    expected: false,
  },
  {
    name: 'greaterThan is strict',
    condition: { field: 'year', operator: 'greaterThan', value: 2020 },
    item: in2020,
    expected: false,
  },
  {
    name: 'lessThan matches a later bound',
    condition: { field: 'year', operator: 'lessThan', value: 2021 },
    item: in2020,
    expected: true,
  },
  {
    name: 'in matches a listed year',
    condition: { field: 'year', operator: 'in', value: [2019, 2020] },
    item: in2020,
    expected: true,
  },
  {
    name: 'notIn rejects a listed year',
    condition: { field: 'year', operator: 'notIn', value: [2020] },
    item: in2020,
    expected: false,
  },
  {
    name: 'between includes both bounds',
    condition: {
      field: 'year',
      operator: 'between',
      value: { min: 2020, max: 2020 },
    },
    item: in2020,
    expected: true,
  },
  {
    name: 'between with a reversed range never matches',
    condition: {
      field: 'year',
      operator: 'between',
      value: { min: 2021, max: 2019 },
    },
    item: in2020,
    expected: false,
  },
  {
    name: 'numeric string year coerces',
    condition: { field: 'year', operator: 'equals', value: '2020' },
    item: in2020,
    expected: true,
  },
  {
    name: 'numeric string mismatch stays false',
    condition: { field: 'year', operator: 'equals', value: '2019' },
    item: in2020,
    expected: false,
  },
  {
    name: 'numeric string array coerces',
    condition: { field: 'year', operator: 'in', value: ['2019', '2020'] },
    item: in2020,
    expected: true,
  },
  {
    name: 'numeric string range bound coerces',
    condition: { field: 'year', operator: 'between', value: { min: '2019' } },
    item: in2020,
    expected: true,
  },
  ...['2020.5', 'abc', '', ' '].flatMap((value): LeafCase[] => [
    {
      name: `equals ${JSON.stringify(value)} is rejected`,
      condition: { field: 'year', operator: 'equals', value },
      item: in2020,
      expected: false,
    },
    {
      name: `notEquals ${JSON.stringify(value)} is rejected`,
      condition: { field: 'year', operator: 'notEquals', value },
      item: in2020,
      expected: false,
    },
  ]),
  {
    name: 'an array for equals is the wrong shape',
    condition: { field: 'year', operator: 'equals', value: [2020] },
    item: in2020,
    expected: false,
  },
  {
    name: 'a show year is read too',
    condition: { field: 'year', operator: 'equals', value: 2015 },
    item: show(),
    context: SHOW_CONTEXT,
    expected: true,
  },
  {
    name: 'missing metadata is unevaluated',
    condition: { field: 'year', operator: 'equals', value: 2020 },
    item: bareItem,
    expected: null,
  },
]

describe('year field', () => {
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
