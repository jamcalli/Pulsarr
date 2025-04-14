import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
  ComparisonOperator,
  FieldInfo,
  OperatorInfo,
} from '@root/types/router.types.js'
import { extractYear } from '@root/types/content-lookup.types.js'

// Type guard for number array
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

// Type guard for number
function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

// Type guard for year range object
interface YearRange {
  min?: number
  max?: number
}

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

// Type guard for valid year value
function isValidYearValue(
  value: unknown,
): value is number | number[] | YearRange {
  return isNumber(value) || isNumberArray(value) || isYearRange(value)
}

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
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
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
        priority: rule.order,
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition | ConditionGroup,
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

      const { operator, value } = condition

      if (operator === 'equals' && isNumber(value)) {
        return year === value
      }

      if (operator === 'notEquals' && isNumber(value)) {
        return year !== value
      }

      if (operator === 'greaterThan' && isNumber(value)) {
        return year > value
      }

      if (operator === 'lessThan' && isNumber(value)) {
        return year < value
      }

      if (operator === 'in' && isNumberArray(value)) {
        return value.includes(year)
      }

      if (operator === 'notIn' && isNumberArray(value)) {
        return !value.includes(year)
      }

      if (isYearRange(value)) {
        const min =
          value.min !== undefined ? value.min : Number.NEGATIVE_INFINITY
        const max =
          value.max !== undefined ? value.max : Number.POSITIVE_INFINITY
        return year >= min && year <= max
      }

      return false
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'year'
    },
  }
}
