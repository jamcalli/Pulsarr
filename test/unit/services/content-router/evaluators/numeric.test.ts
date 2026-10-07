import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import {
  compareNumber,
  compareNumberSet,
  isNumericCriterion,
  type NumericCriterion,
} from '@services/content-router/evaluators/numeric.js'
import { describe, expect, it } from 'vitest'

type NumberCase = [ComparisonOperator, NumericCriterion, boolean]

describe('isNumericCriterion', () => {
  it.each([
    [5, true],
    [[1, 2], true],
    [[], true],
    [{ min: 1 }, true],
    [{ max: 1 }, true],
    [Number.NaN, false],
    [[1, '2'], false],
    [{}, false],
    [{ min: '1' }, false],
    ['5', false],
    [null, false],
  ])('%j is %j', (value, expected) => {
    expect(isNumericCriterion(value)).toBe(expected)
  })
})

describe('compareNumber', () => {
  const cases: NumberCase[] = [
    ['equals', 7, true],
    ['equals', 8, false],
    ['notEquals', 8, true],
    ['greaterThan', 6, true],
    ['greaterThan', 7, false],
    ['lessThan', 8, true],
    ['lessThan', 7, false],
    ['in', [6, 7], true],
    ['in', [6], false],
    ['notIn', [6], true],
    ['notIn', [7], false],
    ['between', { min: 7, max: 7 }, true],
    ['between', { min: 8 }, false],
    ['between', { max: 7 }, true],
    ['between', { min: 9, max: 1 }, false],
    ['equals', [7], false],
    ['in', 7, false],
    ['between', 7, false],
    ['contains', 7, false],
  ]

  it.each(cases)('7 %s %j is %j', (operator, criterion, expected) => {
    expect(compareNumber(7, operator, criterion)).toBe(expected)
  })
})

describe('compareNumberSet', () => {
  const cases: NumberCase[] = [
    ['equals', 2, true],
    ['equals', 5, false],
    ['notEquals', 2, false],
    ['notEquals', 5, true],
    ['greaterThan', 2, true],
    ['greaterThan', 3, false],
    ['lessThan', 2, true],
    ['lessThan', 1, false],
    ['in', [3, 9], true],
    ['in', [9], false],
    ['notIn', [9], true],
    ['notIn', [1, 9], false],
    ['between', { min: 3, max: 4 }, true],
    ['between', { min: 4 }, false],
    ['between', { min: 3, max: 1 }, false],
    ['in', 1, false],
    ['regex', 1, false],
  ]

  it.each(cases)('[1, 2, 3] %s %j is %j', (operator, criterion, expected) => {
    expect(compareNumberSet([1, 2, 3], operator, criterion)).toBe(expected)
  })
})
