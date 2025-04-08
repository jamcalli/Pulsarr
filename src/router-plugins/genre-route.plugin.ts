import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'

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

      const itemGenres = new Set(
        Array.isArray(item.genres)
          ? item.genres
          : typeof item.genres === 'string'
            ? [item.genres]
            : [],
      )

      // Find matching genre routes
      const matchingRules = contentTypeRules.filter((rule) => {
        const genreValue = rule.criteria.genre

        // Make sure the genre value is a string
        if (typeof genreValue === 'string') {
          return itemGenres.has(genreValue)
        }

        return false // Skip if genre is not a string
      })

      if (matchingRules.length === 0) {
        return null
      }

      // Convert to routing decisions
      return matchingRules.map((rule) => {
        return {
          instanceId: rule.target_instance_id,
          qualityProfile: rule.quality_profile,
          rootFolder: rule.root_folder,
          weight: rule.order,
        }
      })
    },
  }
}
