import {
  PlexServerStatusErrorSchema,
  PlexServerStatusSchema,
} from '@schemas/plex/server-status.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/server-status',
    {
      schema: {
        summary: 'Test the Plex server connection',
        operationId: 'getPlexServerStatus',
        description:
          'Probes the Plex server address Pulsarr currently uses, saved or negotiated',
        response: {
          200: PlexServerStatusSchema,
          500: PlexServerStatusErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.plexServerService.getServerStatus()
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to test the Plex server connection',
        })
        return reply.internalServerError(
          'Failed to test the Plex server connection',
        )
      }
    },
  )
}

export default plugin
