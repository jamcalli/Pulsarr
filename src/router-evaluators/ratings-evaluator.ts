import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import { extractTypedGuid } from '@utils/guid-handler.js'
import type { FastifyInstance } from 'fastify'

/**
 * Determines whether the provided value is an array consisting exclusively of numbers.
 */
function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

/**
 * Determines whether the provided value is a number.
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

interface RatingRange {
  min?: number
  max?: number
}

/**
 * Checks if the input is a RatingRange object with optional numeric min/max properties.
 */
function isRatingRange(value: unknown): value is RatingRange {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  const hasMin = 'min' in obj
  const hasMax = 'max' in obj
  if (!hasMin && !hasMax) return false
  const minOk = !hasMin || typeof obj.min === 'number' || obj.min === undefined
  const maxOk = !hasMax || typeof obj.max === 'number' || obj.max === undefined
  return minOk && maxOk
}

/**
 * Determines whether the input is a valid rating value for routing evaluation.
 */
function isValidRatingValue(
  value: unknown,
): value is number | number[] | RatingRange {
  return isNumber(value) || isNumberArray(value) || isRatingRange(value)
}

/**
 * Evaluates a rating condition against a value using the specified operator.
 */
function evaluateRatingCondition(
  actualValue: number,
  operator: string,
  criteriaValue: number | number[] | RatingRange,
): boolean {
  if (isNumber(criteriaValue)) {
    switch (operator) {
      case 'equals':
        return actualValue === criteriaValue
      case 'notEquals':
        return actualValue !== criteriaValue
      case 'greaterThan':
        return actualValue > criteriaValue
      case 'lessThan':
        return actualValue < criteriaValue
      default:
        return false
    }
  }

  if (isNumberArray(criteriaValue)) {
    switch (operator) {
      case 'in':
        return criteriaValue.includes(actualValue)
      case 'notIn':
        return !criteriaValue.includes(actualValue)
      default:
        return false
    }
  }

  if (isRatingRange(criteriaValue) && operator === 'between') {
    const min = criteriaValue.min ?? Number.NEGATIVE_INFINITY
    const max = criteriaValue.max ?? Number.POSITIVE_INFINITY
    return actualValue >= min && actualValue <= max
  }

  return false
}

/**
 * All supported rating fields and their item property accessors.
 * Note: imdbVotes is handled via compound value in imdbRating field, not as separate field.
 *
 * Rotten Tomatoes scores are stored internally as 0-10 (normalized by Plex) but
 * displayed to users as 0-100 (native RT percentage). The evaluator handles conversion.
 */
const RATING_FIELDS = {
  imdbRating: {
    description: 'IMDB rating (0-10 scale, with optional vote count filter)',
    getValue: (item: ContentItem) => item.imdb?.rating,
    userScale: 10,
  },
  rtCriticRating: {
    description: 'Rotten Tomatoes critic score (0-100%)',
    getValue: (item: ContentItem) => item.rtCritic,
    userScale: 100,
  },
  rtAudienceRating: {
    description: 'Rotten Tomatoes audience score (0-100%)',
    getValue: (item: ContentItem) => item.rtAudience,
    userScale: 100,
  },
  tmdbRating: {
    description: 'TMDB rating (0-10 scale)',
    getValue: (item: ContentItem) => item.tmdb,
    userScale: 10,
  },
} as const

type RatingFieldName = keyof typeof RATING_FIELDS

/**
 * Converts a user-facing rating value to the internal 0-10 storage scale.
 * For RT fields (userScale: 100), divides by 10. For others, returns as-is.
 */
function convertToInternalScale(
  value: number | number[] | RatingRange,
  userScale: number,
): number | number[] | RatingRange {
  if (userScale === 10) {
    return value
  }

  const scaleFactor = 10 / userScale

  if (isNumber(value)) {
    return value * scaleFactor
  }

  if (isNumberArray(value)) {
    return value.map((v) => v * scaleFactor)
  }

  if (isRatingRange(value)) {
    return {
      min: value.min !== undefined ? value.min * scaleFactor : undefined,
      max: value.max !== undefined ? value.max * scaleFactor : undefined,
    }
  }

  return value
}

/**
 * Creates a routing evaluator for content ratings (IMDB, Rotten Tomatoes, TMDB).
 *
 * Supports rating-based routing rules with operators: equals, notEquals,
 * greaterThan, lessThan, in, notIn, between.
 */
export default function createRatingsEvaluator(
  _fastify: FastifyInstance,
): RoutingEvaluator {
  const ratingOperators: OperatorInfo[] = [
    {
      name: 'equals',
      description: 'Rating matches exactly',
      valueTypes: ['number'],
    },
    {
      name: 'notEquals',
      description: 'Rating does not match',
      valueTypes: ['number'],
    },
    {
      name: 'greaterThan',
      description: 'Rating is greater than value',
      valueTypes: ['number'],
    },
    {
      name: 'lessThan',
      description: 'Rating is less than value',
      valueTypes: ['number'],
    },
    {
      name: 'in',
      description: 'Rating is one of the provided values',
      valueTypes: ['number[]'],
      valueFormat: 'Array of ratings, e.g. [8.0, 8.5, 9.0]',
    },
    {
      name: 'notIn',
      description: 'Rating is not any of the provided values',
      valueTypes: ['number[]'],
      valueFormat: 'Array of ratings, e.g. [8.0, 8.5, 9.0]',
    },
    {
      name: 'between',
      description: 'Rating is within a range (inclusive)',
      valueTypes: ['object'],
      valueFormat:
        'Object with min and/or max properties, e.g. { min: 7.0, max: 9.0 }',
    },
  ]

  const supportedFields: FieldInfo[] = Object.entries(RATING_FIELDS).map(
    ([name, config]) => ({
      name,
      description: config.description,
      valueTypes: ['number', 'number[]', 'object'],
    }),
  )

  const supportedOperators: Record<string, OperatorInfo[]> = Object.fromEntries(
    Object.keys(RATING_FIELDS).map((field) => [field, ratingOperators]),
  )

  return {
    name: 'Ratings Router',
    description:
      'Routes content based on ratings (IMDB, Rotten Tomatoes, TMDB)',
    priority: 80,
    ruleType: 'imdb', // Keep for backwards compatibility with existing rules
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      // Can evaluate if item has IMDB GUID (for legacy imdb rules)
      const imdbGuid = extractTypedGuid(item.guids, 'imdb:')
      return !!imdbGuid
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
    ): boolean {
      const { field, operator, value } = condition

      // Handle imdbVotes as standalone field (legacy support)
      if (field === 'imdbVotes') {
        if (item.imdb?.votes === null || item.imdb?.votes === undefined) {
          return false
        }
        if (!isValidRatingValue(value)) return false
        return evaluateRatingCondition(item.imdb.votes, operator, value)
      }

      // Check if this is a rating field we handle
      if (!(field in RATING_FIELDS)) {
        return false
      }

      const fieldConfig = RATING_FIELDS[field as RatingFieldName]
      const actualValue = fieldConfig.getValue(item)

      if (actualValue === null || actualValue === undefined) {
        return false
      }

      // Handle compound values (rating + votes) for IMDB
      // Note: No scale conversion needed here - compound values are IMDb-exclusive,
      // and IMDb uses userScale: 10 which matches the internal storage scale.
      if (
        field === 'imdbRating' &&
        typeof value === 'object' &&
        value !== null &&
        ('rating' in value || 'votes' in value)
      ) {
        const compound = value as {
          rating?: number | number[] | RatingRange
          votes?: number | number[] | RatingRange
        }

        if (compound.rating !== undefined) {
          if (!isValidRatingValue(compound.rating)) return false
          if (
            !evaluateRatingCondition(
              actualValue as number,
              operator,
              compound.rating,
            )
          ) {
            return false
          }
        }

        if (compound.votes !== undefined) {
          const votes = item.imdb?.votes
          if (votes === null || votes === undefined) return false
          if (!isValidRatingValue(compound.votes)) return false
          if (!evaluateRatingCondition(votes, operator, compound.votes)) {
            return false
          }
        }

        return true
      }

      // Simple rating value
      if (!isValidRatingValue(value)) {
        return false
      }

      // Convert user-facing value to internal 0-10 scale for comparison
      const internalValue = convertToInternalScale(value, fieldConfig.userScale)

      return evaluateRatingCondition(
        actualValue as number,
        operator,
        internalValue,
      )
    },

    canEvaluateConditionField(field: string): boolean {
      // Handle all rating fields plus imdbVotes as standalone field (legacy support)
      return field in RATING_FIELDS || field === 'imdbVotes'
    },
  }
}
