import { isSonarrResponse } from '@root/types/content-lookup.types.js'
import type {
  Condition,
  ContentItem,
  FieldInfo,
  OperatorInfo,
  RoutingContext,
  RoutingEvaluator,
} from '@root/types/router.types.js'
import { isNumber, isNumberArray, isNumericRange } from '@utils/type-guards.js'
import type { FastifyInstance } from 'fastify'

/**
 * Creates a routing evaluator for TV shows that applies season-based routing rules using season numbers from Sonarr metadata.
 *
 * The evaluator supports the "season" field with operators including equals, notEquals, greaterThan, lessThan, in, notIn, and between, enabling flexible rule matching based on season numbers.
 *
 * @returns A {@link RoutingEvaluator} configured to route Sonarr TV show content according to season-based criteria.
 *
 * @remark Only content of type "show" with valid Sonarr season metadata is processed. Negation logic is handled externally by the routing service.
 */
export default function createSeasonEvaluator(
  _fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata about supported fields
  const supportedFields: FieldInfo[] = [
    {
      name: 'season',
      description: 'Season number(s) of TV show',
      valueTypes: ['number', 'number[]', 'object'],
    },
  ]

  // Define supported operators for the season field - matching the year evaluator pattern
  const supportedOperators: Record<string, OperatorInfo[]> = {
    season: [
      {
        name: 'equals',
        description: 'Season number matches exactly',
        valueTypes: ['number'],
      },
      {
        name: 'notEquals',
        description: 'Season number does not match',
        valueTypes: ['number'],
      },
      {
        name: 'greaterThan',
        description: 'Season number is greater than value',
        valueTypes: ['number'],
      },
      {
        name: 'lessThan',
        description: 'Season number is less than value',
        valueTypes: ['number'],
      },
      {
        name: 'in',
        description: 'Season is one of the provided values',
        valueTypes: ['number[]'],
        valueFormat: 'Array of season numbers, e.g. [1, 2, 3]',
      },
      {
        name: 'notIn',
        description: 'Season is not any of the provided values',
        valueTypes: ['number[]'],
        valueFormat: 'Array of season numbers, e.g. [1, 2, 3]',
      },
      {
        name: 'between',
        description: 'Season is within a range (inclusive)',
        valueTypes: ['object'],
        valueFormat:
          'Object with min and/or max properties, e.g. { min: 1, max: 5 }',
      },
    ],
  }

  /**
   * Extracts all season numbers from the Sonarr metadata of a content item.
   *
   * @param item - The content item to extract season numbers from.
   * @returns An array of season numbers, or an empty array if no Sonarr season metadata is present.
   */
  function extractSeasons(item: ContentItem): number[] {
    if (
      item.metadata &&
      isSonarrResponse(item.metadata) &&
      item.metadata.seasons
    ) {
      return item.metadata.seasons.map((season) => season.seasonNumber)
    }
    return []
  }

  /**
   * Determines whether a content item contains valid Sonarr season metadata.
   *
   * Returns true if the item's metadata is a Sonarr response with a non-empty seasons array.
   *
   * @param item - The content item to check for Sonarr season data.
   * @returns True if the item has Sonarr season metadata; otherwise, false.
   */
  function hasSeasonData(item: ContentItem): boolean {
    return (
      item.metadata !== undefined &&
      isSonarrResponse(item.metadata) &&
      Array.isArray(item.metadata.seasons) &&
      item.metadata.seasons.length > 0
    )
  }

  /**
   * Determines whether a set of season numbers satisfies a specified operator and value condition.
   *
   * Supports the following operators:
   * - "equals", "notEquals", "greaterThan", "lessThan" with a single number value
   * - "in", "notIn" with an array of numbers
   * - "between" with a season range object containing optional {@link min} and/or {@link max} properties
   *
   * @param operator - The comparison operator to apply.
   * @param value - The criterion value, which may be a number, an array of numbers, or a season range object, depending on {@link operator}.
   * @param seasons - The array of season numbers to evaluate.
   * @returns True if the seasons match the specified condition; otherwise, false.
   */
  function matchesSeason(
    operator: string,
    value: unknown,
    seasons: number[],
  ): boolean {
    // Handle different operator types
    if (isNumber(value)) {
      switch (operator) {
        case 'equals':
          return seasons.includes(value)
        case 'notEquals':
          return !seasons.includes(value)
        case 'greaterThan':
          return seasons.some((season) => season > value)
        case 'lessThan':
          return seasons.some((season) => season < value)
        default:
          return false
      }
    }

    if (isNumberArray(value)) {
      switch (operator) {
        case 'in':
          return seasons.some((season) => value.includes(season))
        case 'notIn':
          return !seasons.some((season) => value.includes(season))
        default:
          return false
      }
    }

    if (isNumericRange(value) && operator === 'between') {
      // Only treat finite numeric bounds; undefined-only ranges should not match
      const rawMin = value.min
      const rawMax = value.max
      const hasMin = typeof rawMin === 'number' && Number.isFinite(rawMin)
      const hasMax = typeof rawMax === 'number' && Number.isFinite(rawMax)
      if (!hasMin && !hasMax) {
        return false
      }
      let minSeason: number = hasMin ? rawMin : Number.NEGATIVE_INFINITY
      let maxSeason: number = hasMax ? rawMax : Number.POSITIVE_INFINITY
      // Swap reversed bounds for greater robustness
      if (minSeason > maxSeason) {
        ;[minSeason, maxSeason] = [maxSeason, minSeason]
      }
      return seasons.some(
        (season) => season >= minSeason && season <= maxSeason,
      )
    }

    return false
  }

  return {
    name: 'Season Router',
    description: 'Routes TV shows based on season numbers',
    // Priority chosen to sit between language (65) and year (70)
    priority: 68,
    ruleType: 'season',
    supportedFields,
    supportedOperators,
    contentType: 'sonarr',

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      return context.contentType === 'show' && hasSeasonData(item)
    },

    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      if (!('field' in condition) || condition.field !== 'season') {
        return false
      }

      if (context.contentType !== 'show' || !hasSeasonData(item)) {
        return false
      }

      const seasons = extractSeasons(item)
      if (seasons.length === 0) {
        return false
      }

      const { operator, value } = condition

      return matchesSeason(operator, value, seasons)
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'season'
    },
  }
}
