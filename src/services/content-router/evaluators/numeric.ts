import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import {
  isNumber,
  isNumberArray,
  isNumericRange,
  type NumericRange,
} from '@utils/type-guards.js'

export type NumericCriterion = number | readonly number[] | NumericRange

export function isNumericCriterion(value: unknown): value is NumericCriterion {
  return isNumber(value) || isNumberArray(value) || isNumericRange(value)
}

function inRange(actual: number, range: NumericRange): boolean {
  const min = range.min ?? Number.NEGATIVE_INFINITY
  const max = range.max ?? Number.POSITIVE_INFINITY
  return actual >= min && actual <= max
}

/** Scalar comparison, false for an operator outside the numeric set or a criterion of the wrong shape for it. */
export function compareNumber(
  actual: number,
  operator: ComparisonOperator,
  criterion: NumericCriterion,
): boolean {
  if (isNumber(criterion)) {
    switch (operator) {
      case 'equals':
        return actual === criterion
      case 'notEquals':
        return actual !== criterion
      case 'greaterThan':
        return actual > criterion
      case 'lessThan':
        return actual < criterion
      default:
        return false
    }
  }

  if (isNumberArray(criterion)) {
    switch (operator) {
      case 'in':
        return criterion.includes(actual)
      case 'notIn':
        return !criterion.includes(actual)
      default:
        return false
    }
  }

  return (
    operator === 'between' &&
    isNumericRange(criterion) &&
    inRange(actual, criterion)
  )
}

/** Positive operators match when any member matches, notEquals and notIn when no member matches the positive form. */
export function compareNumberSet(
  actuals: readonly number[],
  operator: ComparisonOperator,
  criterion: NumericCriterion,
): boolean {
  if (isNumber(criterion)) {
    switch (operator) {
      case 'equals':
        return actuals.includes(criterion)
      case 'notEquals':
        return !actuals.includes(criterion)
      case 'greaterThan':
        return actuals.some((actual) => actual > criterion)
      case 'lessThan':
        return actuals.some((actual) => actual < criterion)
      default:
        return false
    }
  }

  if (isNumberArray(criterion)) {
    switch (operator) {
      case 'in':
        return actuals.some((actual) => criterion.includes(actual))
      case 'notIn':
        return !actuals.some((actual) => criterion.includes(actual))
      default:
        return false
    }
  }

  return (
    operator === 'between' &&
    isNumericRange(criterion) &&
    actuals.some((actual) => inRange(actual, criterion))
  )
}
