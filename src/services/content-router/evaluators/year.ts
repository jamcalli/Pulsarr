import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { extractYear } from '@root/types/content-lookup.types.js'
import { defineField } from './define-field.js'
import { compareNumber, isNumericCriterion } from './numeric.js'

function toYear(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return value
  const year = Number(value)
  return Number.isInteger(year) ? year : value
}

function coerceYearValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toYear)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, bound]) => [key, toYear(bound)]),
    )
  }
  return toYear(value)
}

export const year = defineField(ROUTER_FIELDS.year, {
  extract: (item) => (item.metadata ? extractYear(item.metadata) : undefined),
  compare: (actual, operator, value) => {
    const criterion = coerceYearValue(value)
    return (
      isNumericCriterion(criterion) &&
      compareNumber(actual, operator, criterion)
    )
  },
})
