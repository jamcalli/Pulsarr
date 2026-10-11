import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import { ROUTER_FIELDS } from '@root/schemas/content-router/router-fields.js'
import { isNumber, isNumericRange } from '@utils/type-guards.js'
import { defineField } from './define-field.js'
import {
  compareNumber,
  isNumericCriterion,
  type NumericCriterion,
} from './numeric.js'

const present = (value: number | null | undefined): number | undefined =>
  value ?? undefined

// stored scores are 0-10, the 100-scale fields are entered as percentages
const scaleFromHundred = (value: number): number =>
  Math.round(value * (10 / 100) * 10) / 10

function fromHundredScale(criterion: NumericCriterion): NumericCriterion {
  if (isNumber(criterion)) return scaleFromHundred(criterion)
  if (!isNumericRange(criterion)) return criterion.map(scaleFromHundred)
  return {
    min:
      criterion.min === undefined ? undefined : scaleFromHundred(criterion.min),
    max:
      criterion.max === undefined ? undefined : scaleFromHundred(criterion.max),
  }
}

function compareHundredScale(
  actual: number,
  operator: ComparisonOperator,
  value: unknown,
): boolean {
  return (
    isNumericCriterion(value) &&
    compareNumber(actual, operator, fromHundredScale(value))
  )
}

interface ImdbCompound {
  rating?: unknown
  votes?: unknown
}

function isImdbCompound(value: unknown): value is ImdbCompound {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('rating' in value || 'votes' in value)
  )
}

export const imdbRating = defineField(ROUTER_FIELDS.imdbRating, {
  extract: (item) => present(item.imdb?.rating),
  compare: (actual, operator, value, { item }) => {
    if (!isImdbCompound(value)) {
      return isNumericCriterion(value) && compareNumber(actual, operator, value)
    }
    if (value.rating !== undefined) {
      if (
        !isNumericCriterion(value.rating) ||
        !compareNumber(actual, operator, value.rating)
      ) {
        return false
      }
    }
    if (value.votes !== undefined) {
      const votes = item.imdb?.votes
      if (votes == null || !isNumber(value.votes) || votes < value.votes) {
        return false
      }
    }
    return true
  },
})

export const imdbVotes = defineField(ROUTER_FIELDS.imdbVotes, {
  extract: (item) => present(item.imdb?.votes),
})

export const rtCriticRating = defineField(ROUTER_FIELDS.rtCriticRating, {
  extract: (item) => present(item.rtCritic),
  compare: compareHundredScale,
})

export const rtAudienceRating = defineField(ROUTER_FIELDS.rtAudienceRating, {
  extract: (item) => present(item.rtAudience),
  compare: compareHundredScale,
})

export const tmdbRating = defineField(ROUTER_FIELDS.tmdbRating, {
  extract: (item) => present(item.tmdb),
})
