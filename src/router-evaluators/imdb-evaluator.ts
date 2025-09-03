import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RouterRule,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import { extractTypedGuid } from '@utils/guid-handler.js'
import type { FastifyInstance } from 'fastify'

/**
 * Determines whether the provided value is an array consisting exclusively of numbers.
 *
 * @returns True if the value is an array where every element is a number; otherwise, false.
 */
function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

/**
 * Determines whether the provided value is a number.
 *
 * @returns `true` if the value is of type number; otherwise, `false`.
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// Type guard for rating/vote range object
interface RatingRange {
  min?: number
  max?: number
}

/**
 * Checks if the input is a {@link RatingRange} object with optional numeric `min` and/or `max` properties.
 *
 * @param value - The value to check.
 * @returns `true` if the value is an object with at least one of `min` or `max` as a number or undefined; otherwise, `false`.
 */
function isRatingRange(value: unknown): value is RatingRange {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('min' in value || 'max' in value) &&
    (!('min' in value) ||
      typeof value.min === 'number' ||
      value.min === undefined) &&
    (!('max' in value) ||
      typeof value.max === 'number' ||
      value.max === undefined)
  )
}

/**
 * Determines whether the input is a valid rating/vote value for routing evaluation.
 *
 * Accepts a single number, an array of numbers, or a {@link RatingRange} object with optional `min` and/or `max` properties.
 *
 * @returns `true` if the input is a number, an array of numbers, or a {@link RatingRange}; otherwise, `false`.
 */
function isValidImdbValue(
  value: unknown,
): value is number | number[] | RatingRange {
  return isNumber(value) || isNumberArray(value) || isRatingRange(value)
}

/**
 * Creates a routing evaluator that determines routing decisions and evaluates conditions for content items based on their IMDB ratings and vote counts.
 *
 * The evaluator supports a range of operators on the "imdb.rating" and "imdb.votes" fields, including exact match, inequality, range, and array membership. It retrieves IMDB-based routing rules from the database, filters them by content type and enabled status, and matches them against the content item's IMDB data to generate routing decisions. It also provides condition evaluation for IMDB-based rules and exposes metadata describing supported fields and operators.
 *
 * @returns A {@link RoutingEvaluator} for evaluating routing rules and conditions based on IMDB ratings and vote counts.
 *
 * @remark If the database query for routing rules fails, the evaluator logs the error and returns {@code null} from the {@code evaluate} method.
 */
export default function createImdbEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata about the supported fields and operators
  const supportedFields: FieldInfo[] = [
    {
      name: 'imdbRating',
      description: 'IMDB rating (with optional vote count filter)',
      valueTypes: ['number', 'number[]', 'object'],
    },
  ]

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

  const supportedOperators: Record<string, OperatorInfo[]> = {
    imdbRating: ratingOperators,
  }

  return {
    name: 'IMDB Router',
    description: 'Routes content based on IMDB ratings and vote counts',
    priority: 80,
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      // Check if item has IMDB GUID
      const imdbGuid = extractTypedGuid(item.guids, 'imdb:')
      if (!imdbGuid) {
        return false
      }

      // Check if we have IMDB rating data for this item
      try {
        const hasRating = await fastify.imdb.hasRating(item.guids)
        return hasRating
      } catch (error) {
        fastify.log.debug({ error }, 'IMDB evaluator - failed to check rating')
        return false
      }
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      // Get IMDB rating data
      let imdbData: { rating: number | null; votes: number | null } | null =
        null
      try {
        imdbData = await fastify.imdb.getRating(item.guids)
      } catch (error) {
        fastify.log.debug({ error }, 'IMDB evaluator - failed to get rating')
        return null
      }

      if (!imdbData) {
        return null
      }

      const isMovie = context.contentType === 'movie'

      let rules: RouterRule[] = []
      try {
        rules = await fastify.db.getRouterRulesByType('imdb')
      } catch (err) {
        fastify.log.error({ error: err }, 'IMDB evaluator - DB query failed')
        return null
      }

      // Filter rules by target type and enabled status
      const contentTypeRules = rules.filter(
        (rule) =>
          rule.enabled !== false &&
          rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching IMDB rules
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria) return false

        const ratingCriteria = rule.criteria.imdbRating
        const operator =
          typeof rule.criteria.operator === 'string'
            ? rule.criteria.operator
            : 'equals'

        // Must have IMDB rating criteria
        if (ratingCriteria === undefined) return false

        // Check if this is a compound value with both rating and votes
        const isCompoundValue =
          typeof ratingCriteria === 'object' &&
          ratingCriteria !== null &&
          ('rating' in ratingCriteria || 'votes' in ratingCriteria)

        if (isCompoundValue) {
          const compound = ratingCriteria as {
            rating?: number | number[] | RatingRange
            votes?: number | number[] | RatingRange
          }

          // Check rating part of compound value
          if (compound.rating !== undefined) {
            if (!isValidImdbValue(compound.rating)) return false
            if (imdbData.rating === null) return false

            if (
              !evaluateImdbCondition(imdbData.rating, operator, compound.rating)
            ) {
              return false
            }
          }

          // Check votes part of compound value (AND logic)
          if (compound.votes !== undefined) {
            if (!isValidImdbValue(compound.votes)) return false
            if (imdbData.votes === null) return false

            if (
              !evaluateImdbCondition(imdbData.votes, operator, compound.votes)
            ) {
              return false
            }
          }
        } else {
          // Simple rating-only value
          if (!isValidImdbValue(ratingCriteria)) return false
          if (imdbData.rating === null) return false

          if (
            !evaluateImdbCondition(imdbData.rating, operator, ratingCriteria)
          ) {
            return false
          }
        }

        return true
      })

      if (matchingRules.length === 0) {
        return null
      }

      // Convert to routing decisions
      return matchingRules.map((rule) => ({
        instanceId: rule.target_instance_id,
        qualityProfile: rule.quality_profile,
        rootFolder: rule.root_folder,
        tags: rule.tags || [],
        priority: rule.order ?? 50, // Default to 50 if undefined or null
        searchOnAdd: rule.search_on_add,
        seasonMonitoring: rule.season_monitoring,
        seriesType: rule.series_type,
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
    ): boolean {
      // Now we can evaluate conditions using pre-populated IMDB data
      if (!item.imdb) {
        return false // No IMDB data available
      }

      const { field, operator, value } = condition

      if (field === 'imdbRating') {
        if (item.imdb.rating === null || item.imdb.rating === undefined) {
          return false
        }

        // Handle compound values for conditional rules
        if (
          typeof value === 'object' &&
          value !== null &&
          ('rating' in value || 'votes' in value)
        ) {
          const compound = value as {
            rating?: number | number[] | RatingRange
            votes?: number | number[] | RatingRange
          }

          // Check rating part
          if (compound.rating !== undefined) {
            if (!isValidImdbValue(compound.rating)) return false
            if (
              !evaluateImdbCondition(
                item.imdb.rating,
                operator,
                compound.rating,
              )
            ) {
              return false
            }
          }

          // Check votes part (AND logic)
          if (compound.votes !== undefined) {
            if (item.imdb.votes === null || item.imdb.votes === undefined) {
              return false
            }
            if (!isValidImdbValue(compound.votes)) return false
            if (
              !evaluateImdbCondition(item.imdb.votes, operator, compound.votes)
            ) {
              return false
            }
          }

          return true
        } else {
          // Simple rating value
          if (!isValidImdbValue(value)) {
            return false
          }
          const result = evaluateImdbCondition(
            item.imdb.rating,
            operator,
            value,
          )
          return result
        }
      }

      if (field === 'imdbVotes') {
        if (item.imdb.votes === null || item.imdb.votes === undefined) {
          return false
        }
        if (!isValidImdbValue(value)) return false
        return evaluateImdbCondition(item.imdb.votes, operator, value)
      }

      return false
    },

    canEvaluateConditionField(field: string): boolean {
      // Now we can handle IMDB fields synchronously using pre-populated data
      const canEvaluate = field === 'imdbRating' || field === 'imdbVotes'
      return canEvaluate
    },
  }
}

/**
 * Evaluates an IMDB condition (rating or votes) against a value using the specified operator
 */
function evaluateImdbCondition(
  actualValue: number,
  operator: string,
  criteriaValue: number | number[] | RatingRange,
): boolean {
  // Single number comparison
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

  // Array of numbers
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

  // Range object
  if (isRatingRange(criteriaValue) && operator === 'between') {
    const min = criteriaValue.min ?? Number.NEGATIVE_INFINITY
    const max = criteriaValue.max ?? Number.POSITIVE_INFINITY
    return actualValue >= min && actualValue <= max
  }

  return false
}
