import { extractYear } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import {
  isNumber,
  isNumberArray,
  isNumericRange,
  type NumericRange,
} from '@utils/type-guards.js'
import type { FastifyInstance } from 'fastify'

function isValidYearValue(
  value: unknown,
): value is number | number[] | NumericRange {
  return isNumber(value) || isNumberArray(value) || isNumericRange(value)
}

/**
 * Creates a routing evaluator that determines routing decisions and evaluates conditions for content items based on their release year.
 *
 * The evaluator supports a range of operators on the "year" field, including exact match, inequality, range, and array membership. It receives pre-filtered year routing rules from the ContentRouterService and matches them against the content item's metadata.year (from Radarr/Sonarr enrichment) to generate routing decisions. It also provides condition evaluation for year-based rules and exposes metadata describing supported fields and operators.
 *
 * @returns A {@link RoutingEvaluator} for evaluating routing rules and conditions based on content release year.
 *
 * @remark The evaluator operates on pre-filtered rules supplied by the content router. Year metadata is fetched only when needsMetadata enrichment is enabled.
 */
export default function createYearEvaluator(
  _fastify: FastifyInstance,
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
    ruleType: 'year',
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      if (item.metadata) {
        const year = extractYear(item.metadata)
        return year !== undefined
      }
      return false
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
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
      } else if (operator === 'between' && isNumericRange(value)) {
        const min = value.min ?? Number.NEGATIVE_INFINITY
        const max = value.max ?? Number.POSITIVE_INFINITY
        result = year >= min && year <= max
      }

      return result
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'year'
    },
  }
}
