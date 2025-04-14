import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingEvaluator,
  Condition,
  ConditionGroup,
  ComparisonOperator,
  RouterRule,
} from '@root/types/router.types.js'

// Type guard for string array
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

// Type guard for string
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

// Type guard for valid genre value
function isValidGenreValue(value: unknown): value is string | string[] {
  return isString(value) || isStringArray(value)
}

export default function createGenreEvaluator(
  fastify: FastifyInstance,
): RoutingEvaluator {
  return {
    name: 'Genre Router',
    description: 'Routes content based on genre matching rules',
    priority: 80,

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

      // Find matching genre routes
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!rule.criteria || typeof rule.criteria.genre === 'undefined') {
          return false
        }

        const genreValue = rule.criteria.genre
        if (!isValidGenreValue(genreValue)) {
          return false
        }

        if (isStringArray(genreValue)) {
          // Match if any of the rule's genres match any of the item's genres
          return genreValue.some((genre) => itemGenres.has(genre))
        }

        // Single genre match
        return itemGenres.has(genreValue)
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
      // Handle only genre-specific conditions
      if (
        !('field' in condition) ||
        (condition.field !== 'genres' && condition.field !== 'genre')
      ) {
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

      if (operator === 'contains' || operator === 'in') {
        if (isStringArray(value)) {
          return value.some((genre) => itemGenres.has(genre))
        }
        if (isString(value)) {
          return itemGenres.has(value)
        }
        return false
      }

      if (operator === 'notContains' || operator === 'notIn') {
        if (isStringArray(value)) {
          return !value.some((genre) => itemGenres.has(genre))
        }
        if (isString(value)) {
          return !itemGenres.has(value)
        }
        return false
      }

      if (operator === 'equals') {
        if (isStringArray(value)) {
          return (
            value.length === itemGenres.size &&
            value.every((genre) => itemGenres.has(genre))
          )
        }
        if (isString(value)) {
          return itemGenres.size === 1 && itemGenres.has(value)
        }
        return false
      }

      return false
    },

    canEvaluateConditionField(field: string): boolean {
      return field === 'genres' || field === 'genre'
    },
  }
}
