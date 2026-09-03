import {
  MetadataRefreshAcceptedResponseSchema,
  MetadataRefreshErrorResponseSchema,
} from '@schemas/metadata/metadata.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/refresh',
    {
      schema: {
        summary: 'Start a metadata refresh for all watchlist items',
        operationId: 'refreshMetadata',
        description:
          'Starts a background refresh of metadata (posters, GUIDs, genres) for all existing watchlist items by re-fetching data from Plex API. Returns immediately; only one refresh runs at a time.',
        response: {
          202: MetadataRefreshAcceptedResponseSchema,
          409: MetadataRefreshErrorResponseSchema,
          500: MetadataRefreshErrorResponseSchema,
        },
        tags: ['Metadata'],
      },
    },
    async (request, reply) => {
      try {
        if (fastify.metadataRefresh.isRunning()) {
          return reply.conflict('Metadata refresh already running')
        }

        fastify.metadataRefresh.start()

        reply.code(202)

        return {
          success: true as const,
          message: 'Metadata refresh started',
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to start metadata refresh',
        })

        return reply.internalServerError('Unable to refresh metadata')
      }
    },
  )
}

export default plugin
