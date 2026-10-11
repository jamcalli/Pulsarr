import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { isSonarrResponse } from '@root/types/content-lookup.types.js'
import { isNumericRange } from '@utils/type-guards.js'
import { defineField } from './define-field.js'
import {
  compareNumberSet,
  isNumericCriterion,
  type NumericCriterion,
} from './numeric.js'

function orderedBounds(criterion: NumericCriterion): NumericCriterion {
  if (!isNumericRange(criterion)) return criterion
  const { min, max } = criterion
  return min !== undefined && max !== undefined && min > max
    ? { min: max, max: min }
    : criterion
}

export const season = defineField(ROUTER_FIELDS.season, {
  extract: (item, context) => {
    if (context.contentType !== 'show') return undefined
    if (!item.metadata || !isSonarrResponse(item.metadata)) return undefined
    const { seasons } = item.metadata
    if (!Array.isArray(seasons) || seasons.length === 0) return undefined
    return seasons.map((entry) => entry.seasonNumber)
  },
  compare: (actual, operator, value) =>
    isNumericCriterion(value) &&
    compareNumberSet(actual, operator, orderedBounds(value)),
})
