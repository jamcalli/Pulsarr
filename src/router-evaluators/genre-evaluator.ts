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

/**
 * Determines whether the provided value is an array of strings.
 *
 * @param value - The value to check.
 * @returns True if {@link value} is an array where every element is a string; otherwise, false.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Determines whether the provided value is a string.
 *
 * @returns `true` if the value is of type string; otherwise, `false`.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Determines whether a value is a valid genre value, meaning it is either a string or an array of strings.
 *
 * @returns `true` if the value is a string or an array of strings; otherwise, `false`.
 */
function isValidGenreValue(value: unknown): value is string | string[] {
  return isString(value) || isStringArray(value)
}

/**
 * Creates a routing evaluator that routes content based on genre matching rules.
 *
 * The evaluator supports only the "genre" field and provides operators for matching genres, such as contains, in, notContains, notIn, and equals. It fetches genre-based routing rules from the database, filters them according to the content type (movie or series), and determines routing decisions based on whether the content item's genres match the rule criteria.
 *
 * @returns A {@link RoutingEvaluator} specialized for genre-based routing decisions.
 */
export default function createGenreEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  // Define metadata with only one clean field name
  const supportedFields: FieldInfo[] = [
    {
      name: 'genre',
      description: 'Genre categories of the content',
      valueTypes: ['string', 'string[]'],
    },
  ]

  const supportedOperators: Record<string, OperatorInfo[]> = {
    genre: [
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
    ],
  }

  return {
    name: 'Genre Router',
    description: 'Routes content based on genre matching rules',
    priority: 80,
    supportedFields,
    supportedOperators,

    async canEvaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<boolean> {
      return !!(
        item.genres &&
        Array.isArray(item.genres) &&
        item.genres.length > 0
      )
    },

    async evaluate(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      if (
        !item.genres ||
        !Array.isArray(item.genres) ||
        item.genres.length === 0
      ) {
        return null
      }

      const isMovie = context.contentType === 'movie'
      const rules = await fastify.db.getRouterRulesByType('genre')

      // Filter rules by target type (radarr/sonarr)
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      const itemGenres = new Set(item.genres)

      // Find matching genre routes - only check 'genre' field
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || typeof rule.criteria.genre === 'undefined') {
          return false
        }

        const genreValue = rule.criteria.genre
        if (!isValidGenreValue(genreValue)) {
          return false
        }

        // Extract the operator from criteria or default to "contains"
        const operator = rule.criteria.operator || 'contains'

        // Apply the appropriate operation based on the operator
        if (operator === 'contains' || operator === 'in') {
          if (isStringArray(genreValue)) {
            return genreValue.some((genre) => itemGenres.has(genre))
          }
          return itemGenres.has(genreValue)
        }

        if (operator === 'notContains' || operator === 'notIn') {
          if (isStringArray(genreValue)) {
            return !genreValue.some((genre) => itemGenres.has(genre))
          }
          return !itemGenres.has(genreValue)
        }

        if (operator === 'equals') {
          if (isStringArray(genreValue)) {
            return (
              genreValue.length === itemGenres.size &&
              genreValue.every((genre) => itemGenres.has(genre))
            )
          }
          return itemGenres.size === 1 && itemGenres.has(genreValue)
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
      // Only support the 'genre' field
      if (!('field' in condition) || condition.field !== 'genre') {
        return false
      }

      if (
        !item.genres ||
        !Array.isArray(item.genres) ||
        item.genres.length === 0
      ) {
        return false
      }

      const itemGenres = new Set(item.genres)
      const { operator, value } = condition
      let matched = false

      if (operator === 'contains' || operator === 'in') {
        if (isStringArray(value)) {
          matched = value.some((genre) => itemGenres.has(genre))
        } else if (isString(value)) {
          matched = itemGenres.has(value)
        }
      }

      if (operator === 'notContains' || operator === 'notIn') {
        if (isStringArray(value)) {
          matched = !value.some((genre) => itemGenres.has(genre))
        } else if (isString(value)) {
          matched = !itemGenres.has(value)
        }
      }

      if (operator === 'equals') {
        if (isStringArray(value)) {
          matched =
            value.length === itemGenres.size &&
            value.every((genre) => itemGenres.has(genre))
        } else if (isString(value)) {
          matched = itemGenres.size === 1 && itemGenres.has(value)
        }
      }

      // Apply negation if needed
      return condition.negate ? !matched : matched
    },

    canEvaluateConditionField(field: string): boolean {
      // Only support the 'genre' field
      return field === 'genre'
    },
  }
}
