import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  FieldInfo,
  OperatorInfo,
} from '@root/types/router.types.js'
import { isSonarrResponse } from '@root/types/content-lookup.types.js'

/**
 * Determines whether the provided value is an array of numbers.
 *
 * @param value - The value to check.
 * @returns True if the value is an array where every element is a number; otherwise, false.
 */
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

/**
 * Determines whether the provided value is a number.
 *
 * @returns True if the value is of type number; otherwise, false.
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

// Type guard for season range object
interface SeasonRange {
  min?: number
  max?: number
}

/**
 * Determines whether the given value is a {@link SeasonRange} object with optional numeric `min` and/or `max` properties.
 *
 * @param value - The value to check.
 * @returns `true` if the value is an object containing at least one of `min` or `max` as a number or undefined; otherwise, `false`.
 */
function isSeasonRange(value: unknown): value is SeasonRange {
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
 * Determines whether the input is a valid season value.
 *
 * A valid season value is a number, an array of numbers, or a {@link SeasonRange} object with optional `min` and/or `max` properties.
 *
 * @returns `true` if the input is a number, an array of numbers, or a {@link SeasonRange}; otherwise, `false`.
 */
function isValidSeasonValue(
  value: unknown,
): value is number | number[] | SeasonRange {
  return isNumber(value) || isNumberArray(value) || isSeasonRange(value)
}

/**
 * Creates a routing evaluator that routes TV show content based on season numbers.
 *
 * The evaluator supports the "season" field with operators such as equals, notEquals, in, notIn, greaterThan, lessThan, and between.
 * It extracts season data from Sonarr metadata and applies routing rules based on season numbers.
 *
 * @returns A {@link RoutingEvaluator} specialized for season-based routing.
 */
export default function createSeasonEvaluator(
  fastify: FastifyInstance,
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
   * Extracts season numbers from Sonarr metadata.
   *
   * @param item - The content item from which to extract season data.
   * @returns An array of season numbers if available; otherwise, an empty array.
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
   * Checks if the content item has season metadata.
   *
   * @param item - The content item to check.
   * @returns True if the item has season data in its metadata; otherwise, false.
   */
  function hasSeasonData(item: ContentItem): boolean {
    return (
      item.metadata !== undefined &&
      isSonarrResponse(item.metadata) &&
      Array.isArray(item.metadata.seasons) &&
      item.metadata.seasons.length > 0
    )
  }

  return {
    name: 'Season Router',
    description: 'Routes TV shows based on season numbers',
    priority: 68, // Lower than language (65) but higher than year (70)
    supportedFields,
    supportedOperators,
    contentType: 'sonarr', // Specify that this evaluator is only for Sonarr/TV shows

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      // Only evaluate for TV shows with season data
      return context.contentType === 'show' && hasSeasonData(item)
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      // Skip if not a TV show or no season data
      if (context.contentType !== 'show' || !hasSeasonData(item)) {
        return null
      }

      const seasons = extractSeasons(item)
      if (seasons.length === 0) {
        return null
      }

      // Get all season-based router rules
      let rules
      try {
        rules = await fastify.db.getRouterRulesByType('season')
      } catch (err) {
        fastify.log.error({ err }, 'Season evaluator - DB query failed')
        return null
      }

      // Filter rules to only include those for Sonarr and that are enabled
      const sonarrRules = rules.filter(
        (rule) => rule.target_type === 'sonarr' && rule.enabled !== false,
      )

      // Find matching rules based on season criteria
      const matchingRules = sonarrRules.filter((rule) => {
        if (!rule.criteria || !rule.criteria.season) {
          return false
        }

        const seasonValue = rule.criteria.season
        const operator = rule.criteria.operator || 'equals'

        if (!isValidSeasonValue(seasonValue)) {
          return false
        }

        // Different logic based on the operator - matching year evaluator pattern
        if (isNumber(seasonValue)) {
          switch (operator) {
            case 'equals':
              return seasons.includes(seasonValue)
            case 'notEquals':
              return !seasons.includes(seasonValue)
            case 'greaterThan':
              return seasons.some((season) => season > seasonValue)
            case 'lessThan':
              return seasons.some((season) => season < seasonValue)
            default:
              return false
          }
        }

        // Array of seasons
        if (isNumberArray(seasonValue)) {
          switch (operator) {
            case 'in':
              return seasons.some((season) => seasonValue.includes(season))
            case 'notIn':
              return !seasons.some((season) => seasonValue.includes(season))
            default:
              return false
          }
        }

        // Range object
        if (isSeasonRange(seasonValue) && operator === 'between') {
          const minSeason =
            typeof seasonValue.min === 'number'
              ? seasonValue.min
              : Number.NEGATIVE_INFINITY
          const maxSeason =
            typeof seasonValue.max === 'number'
              ? seasonValue.max
              : Number.POSITIVE_INFINITY

          return seasons.some(
            (season) => season >= minSeason && season <= maxSeason,
          )
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
        tags: rule.tags || [],
        priority: rule.order || 50, // Default to 50 if not specified
        searchOnAdd: rule.search_on_add,
        seasonMonitoring: rule.season_monitoring,
      }))
    },

    // For conditional evaluator support
    evaluateCondition(
      condition: Condition,
      item: ContentItem,
      context: RoutingContext,
    ): boolean {
      // Only support the 'season' field
      if (!('field' in condition) || condition.field !== 'season') {
        return false
      }

      // Skip if not a TV show or no season data
      if (context.contentType !== 'show' || !hasSeasonData(item)) {
        return false
      }

      const seasons = extractSeasons(item)
      if (seasons.length === 0) {
        return false
      }

      const { operator, value } = condition
      let result = false

      // Handle different operator types
      if (isNumber(value)) {
        switch (operator) {
          case 'equals':
            result = seasons.includes(value)
            break
          case 'notEquals':
            result = !seasons.includes(value)
            break
          case 'greaterThan':
            result = seasons.some((season) => season > value)
            break
          case 'lessThan':
            result = seasons.some((season) => season < value)
            break
        }
      } else if (isNumberArray(value)) {
        switch (operator) {
          case 'in':
            result = seasons.some((season) => value.includes(season))
            break
          case 'notIn':
            result = !seasons.some((season) => value.includes(season))
            break
        }
      } else if (isSeasonRange(value) && operator === 'between') {
        const minSeason =
          typeof value.min === 'number' ? value.min : Number.NEGATIVE_INFINITY
        const maxSeason =
          typeof value.max === 'number' ? value.max : Number.POSITIVE_INFINITY

        result = seasons.some(
          (season) => season >= minSeason && season <= maxSeason,
        )
      }

      // Do not apply negation here - the content router service handles negation at a higher level.
      // This prevents double-negation issues when condition.negate is true.
      return result
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'season' field
      return field === 'season'
    },
  }
}
