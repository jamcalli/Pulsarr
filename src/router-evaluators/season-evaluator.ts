import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  FieldInfo,
  OperatorInfo,
  RouterRule,
} from '@root/types/router.types.js'
import { isSonarrResponse } from '@root/types/content-lookup.types.js'

/**
 * Determines whether the input is an array containing only numbers.
 *
 * @param value - The value to check.
 * @returns True if the input is an array and every element is a number; otherwise, false.
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
 * Determines whether a value is a {@link SeasonRange} object with optional numeric `min` and/or `max` properties.
 *
 * @param value - The value to check.
 * @returns `true` if {@link value} is an object containing at least one of `min` or `max`, and each is either a number or undefined; otherwise, `false`.
 */
function isSeasonRange(value: unknown): value is SeasonRange {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('min' in value || 'max' in value) &&
    (() => {
      const v = value as Record<string, unknown>
      return (
        (!('min' in v) || typeof v.min === 'number' || v.min === undefined) &&
        (!('max' in v) || typeof v.max === 'number' || v.max === undefined)
      )
    })()
  )
}

/**
 * Determines whether the input is a valid season value for routing rules.
 *
 * A valid season value is a number, an array of numbers, or an object with optional `min` and/or `max` properties representing a season range.
 *
 * @returns `true` if the input is a valid season value; otherwise, `false`.
 */
function isValidSeasonValue(
  value: unknown,
): value is number | number[] | SeasonRange {
  return isNumber(value) || isNumberArray(value) || isSeasonRange(value)
}

/**
 * Creates a routing evaluator that applies season-based routing rules to TV show content using season numbers from Sonarr metadata.
 *
 * The evaluator supports the "season" field with operators such as equals, notEquals, greaterThan, lessThan, in, notIn, and between, matching content items to routing rules based on their season numbers.
 *
 * @returns A {@link RoutingEvaluator} configured for season-based routing of Sonarr TV shows.
 *
 * @remark This evaluator only processes content of type "show" with valid Sonarr season metadata. Negation logic is not handled internally and must be managed by the routing service.
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
   * Extracts season numbers from the Sonarr metadata of a content item.
   *
   * Returns an array of season numbers if present; otherwise, returns an empty array.
   *
   * @param item - The content item from which to extract season numbers.
   * @returns An array of season numbers, or an empty array if no valid Sonarr season metadata is found.
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
   * Checks if a content item contains valid Sonarr season metadata.
   *
   * Returns true if the item's metadata is a Sonarr response with a non-empty array of seasons; otherwise, returns false.
   *
   * @param item - The content item to check.
   * @returns True if Sonarr season data is present; otherwise, false.
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
   * Checks if a set of season numbers satisfies a given operator and value criterion.
   *
   * Supports single number comparisons (equals, notEquals, greaterThan, lessThan), array membership (in, notIn), and range checks (between) for season numbers.
   *
   * @param operator - The comparison operator to apply ("equals", "notEquals", "greaterThan", "lessThan", "in", "notIn", or "between").
   * @param value - The criterion value, which may be a number, array of numbers, or a season range object depending on the operator.
   * @param seasons - The array of season numbers to evaluate.
   * @returns True if the seasons match the specified criterion; otherwise, false.
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

    if (isSeasonRange(value) && operator === 'between') {
      const minSeason =
        typeof value.min === 'number' ? value.min : Number.NEGATIVE_INFINITY
      const maxSeason =
        typeof value.max === 'number' ? value.max : Number.POSITIVE_INFINITY

      const minSeen = Math.min(...seasons)
      const maxSeen = Math.max(...seasons)
      return minSeen <= maxSeason && maxSeen >= minSeason
    }

    return false
  }

  return {
    name: 'Season Router',
    description: 'Routes TV shows based on season numbers',
    // Priority chosen to sit between language (65) and year (70)
    priority: 68,
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
      let rules: RouterRule[] = []
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
        const operator = (rule.criteria.operator as string) || 'equals'

        if (!isValidSeasonValue(seasonValue)) {
          return false
        }

        // Use the shared helper function to match seasons
        return matchesSeason(operator, seasonValue, seasons)
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
        seriesType: rule.series_type,
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

      // Use the shared helper function to match seasons
      const result = matchesSeason(operator, value, seasons)

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
