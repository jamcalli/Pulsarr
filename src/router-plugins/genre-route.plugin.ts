import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
  GenreCriteria,
} from '@root/types/router.types.js'

/**
 * Type guard to check if a value is a GenreCriteria object
 */
function isGenreCriteria(value: unknown): value is GenreCriteria {
  if (!value || typeof value !== 'object') return false
  const criteria = value as GenreCriteria
  return (
    'genre' in criteria &&
    (typeof criteria.genre === 'string' ||
      (Array.isArray(criteria.genre) &&
        criteria.genre.every((g) => typeof g === 'string')))
  )
}

/**
 * Creates a router plugin for genre-based content routing.
 *
 * The returned plugin includes metadata and an asynchronous `evaluateRouting` method. This method:
 * - Returns null if the content item lacks genres.
 * - Retrieves genre routing rules from the database.
 * - Filters rules based on the content type (using "radarr" for movies and "sonarr" for others).
 * - Converts the content item's genres into a set for efficient matching.
 * - Maps matching rules to routing decisions with properties such as instanceId, qualityProfile, rootFolder, and weight.
 *
 * @returns A router plugin configured for genre-based routing.
 */
export default function createGenreRouterPlugin(
  fastify: FastifyInstance,
): RouterPlugin {
  return {
    name: 'Genre Router',
    description: 'Routes content based on genre matching rules',
    enabled: true,
    order: 50,

    async evaluateRouting(
      item: ContentItem,
      context: RoutingContext,
    ): Promise<RoutingDecision[] | null> {
      // Skip if no genres available
      if (
        !item.genres ||
        !Array.isArray(item.genres) ||
        item.genres.length === 0
      ) {
        return null
      }

      // Get the appropriate type of rules
      const isMovie = context.contentType === 'movie'
      const rules = await fastify.db.getRouterRulesByType('genre')

      // Filter to only rules for the current content type
      const contentTypeRules = rules.filter(
        (rule) => rule.target_type === (isMovie ? 'radarr' : 'sonarr'),
      )

      const itemGenres = new Set(item.genres)

      // Find matching genre routes
      const matchingRules = contentTypeRules.filter((rule) => {
        if (!isGenreCriteria(rule.criteria)) {
          return false
        }

        const genreValue = rule.criteria.genre

        if (Array.isArray(genreValue)) {
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
        weight: rule.order,
      }))
    },
  }
}
