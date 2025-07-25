import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  MetadataRefreshSuccessResponseSchema,
  MetadataRefreshErrorResponseSchema,
  type MetadataRefreshSuccessResponse,
  type MetadataRefreshErrorResponse,
} from '@schemas/metadata/metadata.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Reply: MetadataRefreshSuccessResponse | MetadataRefreshErrorResponse
  }>(
    '/refresh',
    {
      schema: {
        summary: 'Refresh metadata for all watchlist items',
        operationId: 'refreshMetadata',
        description:
          'Forces a refresh of metadata (posters, GUIDs, genres) for all existing watchlist items by re-fetching data from Plex API',
        response: {
          200: MetadataRefreshSuccessResponseSchema,
          500: MetadataRefreshErrorResponseSchema,
        },
        tags: ['Metadata'],
      },
    },
    async (request, reply) => {
      try {
        fastify.log.info('Starting metadata refresh for all watchlist items')

        // Refresh self watchlist with force refresh flag
        const selfWatchlistResult =
          await fastify.plexWatchlist.getSelfWatchlist(true)

        // Refresh others watchlist with force refresh flag
        const othersWatchlistResult =
          await fastify.plexWatchlist.getOthersWatchlists(true)

        const totalSelfItems = selfWatchlistResult.total
        const totalOthersItems = othersWatchlistResult.total
        const totalItems = totalSelfItems + totalOthersItems

        fastify.log.info(
          `Metadata refresh completed: ${totalItems} items refreshed (${totalSelfItems} self, ${totalOthersItems} others)`,
        )

        return {
          success: true,
          message: `Successfully refreshed metadata for ${totalItems} watchlist items (${totalSelfItems} self, ${totalOthersItems} others)`,
          totalItems,
          selfItems: totalSelfItems,
          othersItems: totalOthersItems,
        }
      } catch (err) {
        fastify.log.error(`Error refreshing metadata: ${err}`)
        return reply.internalServerError('Unable to refresh metadata')
      }
    },
  )
}

export default plugin
