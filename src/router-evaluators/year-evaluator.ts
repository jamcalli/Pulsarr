import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
  FieldInfo,
  OperatorInfo,
} from '@root/types/router.types.js'
import { extractYear } from '@root/types/content-lookup.types.js'

/**
 * Determines whether the given value is an array consisting only of numbers.
 *
 * @returns True if the value is an array where every element is a number; otherwise, false.
 */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

/**
 * Determines whether the provided value is a number.
 *
 * @returns `true` if the value is of type `number`; otherwise, `false`.
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
 * Determines whether the given value is a {@link YearRange} object.
 *
 * A value is considered a {@link YearRange} if it is a non-null object containing at least a `min` or `max` property, where each property is either a number or undefined.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid {@link YearRange}; otherwise, `false`.
 */
function isYearRange(value: unknown): value is YearRange {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('min' in value || 'max' in value) &&
    (('min' in value &&
      (typeof value.min === 'number' || value.min === undefined)) ||
      ('max' in value &&
        (typeof value.max === 'number' || value.max === undefined)))
  )
}

/**
 * Determines whether a value is a valid year criterion, accepting a number, an array of numbers, or a year range object.
 *
 * @returns `true` if the value is a number, an array of numbers, or a {@link YearRange} object; otherwise, `false`.
 */
function isValidYearValue(
  value: unknown,
): value is number | number[] | YearRange {
  return isNumber(value) || isNumberArray(value) || isYearRange(value)
}

/**
 * Creates a routing evaluator that determines routing decisions for content based on its release year.
 *
 * The evaluator supports multiple operators for the "year" field, including exact match, range, and array membership. It retrieves year-based routing rules from the database, filters them by content type and enabled status, and matches them against the content's release year to produce routing decisions. It also provides condition evaluation for year-based rules.
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

      // Filter rules by target type
      const contentTypeRules = rules.filter(
        (rule) =>
          rule.enabled !==
            false /* default to enabled when field is absent */ &&
          rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      // Find matching year rules
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || typeof rule.criteria.year === 'undefined') {
          return false
        }

        const ruleYear = rule.criteria.year
        if (!isValidYearValue(ruleYear)) {
          return false
        }

        // Single number comparison
        if (isNumber(ruleYear)) {
          return year === ruleYear
        }

        // Array of years
        if (isNumberArray(ruleYear)) {
          return ruleYear.includes(year)
        }

        // Range object
        if (isYearRange(ruleYear)) {
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

      // Handle the between operator explicitly
      if (operator === 'between' && isYearRange(value)) {
        const min = value.min ?? Number.NEGATIVE_INFINITY
        const max = value.max ?? Number.POSITIVE_INFINITY
        const result = year >= min && year <= max
        return negate ? !result : result
      }

      // Handle all other operators
      let result = false

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
      }

      // Apply negation if needed
      return negate ? !result : result
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'year'
    },
  }
}
