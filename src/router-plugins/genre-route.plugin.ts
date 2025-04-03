import type { FastifyInstance } from 'fastify'
import type {
  ContentItem,
  RouterPlugin,
  RoutingContext,
  RoutingDecision,
} from '../types/router.types.js'

export default function createGenreRouterPlugin(
  fastify: FastifyInstance,
): RouterPlugin {
  return {
    name: 'Genre Router',
    description: 'Routes content based on genre matching rules',
    enabled: true,
    order: 50, // Middle priority

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

      // Use the injected fastify instance
      const isMovie = context.contentType === 'movie'
      const genreRoutes = isMovie
        ? await fastify.db.getRadarrGenreRoutes()
        : await fastify.db.getSonarrGenreRoutes()

      const itemGenres = new Set(
        Array.isArray(item.genres)
          ? item.genres
          : typeof item.genres === 'string'
            ? [item.genres]
            : [],
      )

      // Find matching genre routes
      const matchingRoutes = genreRoutes.filter((route) =>
        itemGenres.has(route.genre),
      )

      if (matchingRoutes.length === 0) {
        return null
      }

      // Convert to routing decisions
      return matchingRoutes.map((route) => {
        // Determine the right instance ID based on content type
        let instanceId: number
        if (isMovie) {
          // For movies, use RadarrGenreRoute
          instanceId = (route as { radarrInstanceId: number }).radarrInstanceId
        } else {
          // For shows, use SonarrGenreRoute
          instanceId = (route as { sonarrInstanceId: number }).sonarrInstanceId
        }

        return {
          instanceId,
          qualityProfile: route.qualityProfile,
          rootFolder: route.rootFolder,
          weight: 50,
        }
      })
    },
  }
}
