import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import { evaluateRegexSafelyMultiple } from '@utils/regex-safety.js'
import type { FastifyInstance } from 'fastify'

/**
 * Normalizes a string by converting it to lowercase and trimming whitespace.
 *
 * @param str - The string to normalize.
 * @returns The normalized string.
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim()
}

/**
 * Determines whether the provided value is an array containing only strings.
 *
 * @param value - The value to check.
 * @returns True if {@link value} is an array where every element is a string; otherwise, false.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Checks if a value is a string.
 *
 * @returns `true` if the value is a string; otherwise, `false`.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Checks if a value is suitable for genre evaluation as a string or an array of strings.
 *
 * @returns `true` if the value is a string or an array of strings; otherwise, `false`.
 */
function _isValidGenreValue(value: unknown): value is string | string[] {
  return isString(value) || isStringArray(value)
}

/**
 * Constructs a routing evaluator that matches content items to routing rules based on their genres.
 *
 * The evaluator supports only the "genres" field and provides operators for genre matching: `contains`, `in`, `notContains`, `notIn`, `equals`, and `regex`. It retrieves genre-based routing rules from the database, filters them by content type and enabled status, and determines if a content item's genres satisfy the rule criteria to produce routing decisions. It also supports evaluating individual genre conditions for conditional routing logic.
 *
 * @returns A {@link RoutingEvaluator} specialized for genre-based routing.
 *
 * @remark
 * If a genre-matching rule or condition uses an invalid regular expression, the error is logged and the rule or condition is ignored.
 */
export default function createGenreEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata with only one clean field name
  const supportedFields: FieldInfo[] = [
    {
      name: 'genres',
      description: 'Genre categories of the content',
      valueTypes: ['string', 'string[]'],
    },
  ]
  const supportedOperators: Record<string, OperatorInfo[]> = {
    genres: [
      {
        name: 'contains',
        description: 'Content genre list contains this genre',
        valueTypes: ['string'],
      },
      {
        name: 'in',
        description: 'Content has at least one of these genres',
        valueTypes: ['string[]'],
        valueFormat: 'Array of genre names, e.g. ["Action", "Thriller"]',
      },
      {
        name: 'notContains',
        description: "Content genre list doesn't contain this genre",
        valueTypes: ['string'],
      },
      {
        name: 'notIn',
        description: "Content doesn't have any of these genres",
        valueTypes: ['string[]'],
        valueFormat: 'Array of genre names, e.g. ["Horror", "Comedy"]',
      },
      {
        name: 'equals',
        description: 'Content genres exactly match the provided genres',
        valueTypes: ['string', 'string[]'],
        valueFormat: 'Single genre or array of all expected genres',
      },
      {
        name: 'regex',
        description: 'At least one genre matches the regular expression',
        valueTypes: ['string'],
      },
    ],
  }
  return {
    name: 'Genre Router',
    description: 'Routes content based on genre matching rules',
    priority: 80,
    ruleType: 'genre',
    supportedFields,
    supportedOperators,
    async canEvaluate(
      item: ContentItem,
      _context: RoutingContext,
    ): Promise<boolean> {
      return !!(
        item.genres &&
        Array.isArray(item.genres) &&
        item.genres.length > 0
      )
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      _context: RoutingContext,
    ): boolean {
      // Only support the 'genres' field
      if (!('field' in condition) || condition.field !== 'genres') {
        return false
      }

      if (
        !item.genres ||
        !Array.isArray(item.genres) ||
        item.genres.length === 0
      ) {
        return false
      }

      // Create a set of normalized genres for case-insensitive comparison
      const itemGenres = new Set(item.genres.map(normalizeString))

      const { operator, value, negate: _ = false } = condition
      let matched = false

      switch (operator) {
        case 'contains':
        case 'in':
          if (isStringArray(value)) {
            matched = value.some((genre) =>
              itemGenres.has(normalizeString(genre)),
            )
          } else if (isString(value)) {
            matched = itemGenres.has(normalizeString(value))
          }
          break
        case 'notContains':
        case 'notIn':
          if (isStringArray(value)) {
            matched = !value.some((genre) =>
              itemGenres.has(normalizeString(genre)),
            )
          } else if (isString(value)) {
            matched = !itemGenres.has(normalizeString(value))
          }
          break
        case 'equals':
          if (isStringArray(value)) {
            const normalizedValues = new Set(value.map(normalizeString))
            matched =
              normalizedValues.size === itemGenres.size &&
              Array.from(normalizedValues).every((genre) =>
                itemGenres.has(genre),
              )
          } else if (isString(value)) {
            matched =
              itemGenres.size === 1 && itemGenres.has(normalizeString(value))
          }
          break
        case 'regex':
          if (isString(value)) {
            matched = evaluateRegexSafelyMultiple(
              value,
              Array.from(itemGenres),
              fastify.log,
              'genre condition',
            )
          }
          break
      }

      // Do not apply negation here - the content router service handles negation at a higher level.
      // This prevents double-negation issues when condition.negate is true.
      return matched
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'genres' field
      return field === 'genres'
    },
  }
}
