import type { FastifyInstance } from 'fastify'
import {
  type ContentItem,
  type RoutingContext,
  type RoutingDecision,
  type RoutingEvaluator,
  type Condition,
  ConditionGroup,
  type FieldInfo,
  type OperatorInfo,
} from '@root/types/router.types.js'
import { extractYear } from '@root/types/content-lookup.types.js'

/**
 * Determines whether the input is an array consisting exclusively of numbers.
 *
 * @returns True if the input is an array where every element is a number; otherwise, false.
 */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

/**
 * Determines whether the provided value is of type number.
 *
 * @returns `true` if the value is a number; otherwise, `false`.
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

// Type guard for year range object
interface YearRange {
  min?: number
  max?: number
}

/**
 * Determines whether the given value is a {@link YearRange} object with optional numeric `min` and/or `max` properties.
 *
 * @param value - The value to check.
 * @returns `true` if the value is an object containing at least one of `min` or `max` as a number or undefined; otherwise, `false`.
 */
function isYearRange(value: unknown): value is YearRange {
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
 * Determines whether the input is a valid year value.
 *
 * A valid year value is a number, an array of numbers, or a {@link YearRange} object with optional `min` and/or `max` properties.
 *
 * @returns `true` if the input matches one of the valid year value types; otherwise, `false`.
 */
function isValidYearValue(
  value: unknown,
): value is number | number[] | YearRange {
  return isNumber(value) || isNumberArray(value) || isYearRange(value)
}

/**
 * Creates a routing evaluator that determines routing decisions for content items based on their release year.
 *
 * The evaluator supports operators for the "year" field, including exact match, range, and array membership. It retrieves year-based routing rules from the database, filters them by content type and enabled status, and matches them against the content's release year to produce routing decisions. It also provides condition evaluation for year-based rules and exposes metadata describing supported fields and operators.
 *
 * @returns A {@link RoutingEvaluator} instance for evaluating routing rules and conditions based on content release year.
 */
export default function createYearEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata about the supported fields and operators
  const supportedFields: FieldInfo[] = [
    {
      name: 'year',
      description: 'Release year of the content',
      valueTypes: ['number', 'number[]', 'object'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    year: [
      {
        name: 'equals',
        description: 'Year matches exactly',
        valueTypes: ['number'],
      },
      {
        name: 'notEquals',
        description: 'Year does not match',
        valueTypes: ['number'],
      },
      {
        name: 'greaterThan',
        description: 'Year is greater than value',
        valueTypes: ['number'],
      },
      {
        name: 'lessThan',
        description: 'Year is less than value',
        valueTypes: ['number'],
      },
      {
        name: 'in',
        description: 'Year is one of the provided values',
        valueTypes: ['number[]'],
        valueFormat: 'Array of years, e.g. [1980, 1981, 1982]',
      },
      {
        name: 'notIn',
        description: 'Year is not any of the provided values',
        valueTypes: ['number[]'],
        valueFormat: 'Array of years, e.g. [1980, 1981, 1982]',
      },
      {
        name: 'between',
        description: 'Year is within a range (inclusive)',
        valueTypes: ['object'],
        valueFormat:
          'Object with min and/or max properties, e.g. { min: 1980, max: 1989 }',
      },
    ],
  }

  return {
    name: 'Year Router',
    description: 'Routes content based on release year',
    priority: 70,
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      if (item.metadata) {
        const year = extractYear(item.metadata)
        return year !== undefined
      }
      return false
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      if (!item.metadata) {
        return null
      }

      const year = extractYear(item.metadata)
      if (year === undefined) {
        return null
      }

      const isMovie = context.contentType === 'movie'
      const rules = await fastify.db.getRouterRulesByType('year')

      // Filter rules by target type and enabled status
      const contentTypeRules = rules.filter(
        (rule) =>
          rule.enabled !== false &&
          rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching year rules
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || typeof rule.criteria.year === 'undefined') {
          return false
        }

        const ruleYear = rule.criteria.year
        const operator = rule.criteria.operator || 'equals'

        if (!isValidYearValue(ruleYear)) {
          return false
        }

        // Single number comparison
        if (isNumber(ruleYear)) {
          switch (operator) {
            case 'equals':
              return year === ruleYear
            case 'notEquals':
              return year !== ruleYear
            case 'greaterThan':
              return year > ruleYear
            case 'lessThan':
              return year < ruleYear
            default:
              return false
          }
        }

        // Array of years
        if (isNumberArray(ruleYear)) {
          switch (operator) {
            case 'in':
              return ruleYear.includes(year)
            case 'notIn':
              return !ruleYear.includes(year)
            default:
              return false
          }
        }

        // Range object
        if (isYearRange(ruleYear) && operator === 'between') {
          const minYear =
            typeof ruleYear.min === 'number'
              ? ruleYear.min
              : Number.NEGATIVE_INFINITY
          const maxYear =
            typeof ruleYear.max === 'number'
              ? ruleYear.max
              : Number.POSITIVE_INFINITY

          return year >= minYear && year <= maxYear
        }

        return false
      })

      if (matchingRules.length === 0) {
        return null
      }

      // Convert to routing decisions
      return matchingRules.map((rule) => ({
        instanceId: rule.target_instance_id,
        qualityProfile: rule.quality_profile,
        rootFolder: rule.root_folder,
        priority: rule.order || 50, // Default to 50 if not specified
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      if (!('field' in condition) || condition.field !== 'year') {
        return false
      }

      if (!item.metadata) {
        return false
      }

      const year = extractYear(item.metadata)
      if (year === undefined) {
        return false
      }

      const { operator, value, negate = false } = condition

      // Early exit on invalid value type
      if (!isValidYearValue(value)) return false

      let result = false

      // Handle all operators
      if (operator === 'equals' && isNumber(value)) {
        result = year === value
      } else if (operator === 'notEquals' && isNumber(value)) {
        result = year !== value
      } else if (operator === 'greaterThan' && isNumber(value)) {
        result = year > value
      } else if (operator === 'lessThan' && isNumber(value)) {
        result = year < value
      } else if (operator === 'in' && isNumberArray(value)) {
        result = value.includes(year)
      } else if (operator === 'notIn' && isNumberArray(value)) {
        result = !value.includes(year)
      } else if (operator === 'between' && isYearRange(value)) {
        const min = value.min ?? Number.NEGATIVE_INFINITY
        const max = value.max ?? Number.POSITIVE_INFINITY
        result = year >= min && year <= max
      }

      // Apply negation if needed
      return negate ? !result : result
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'year'
    },
  }
}
