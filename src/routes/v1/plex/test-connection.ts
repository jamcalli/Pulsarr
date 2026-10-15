import { ErrorSchema } from '@schemas/common/error.schema.js'
import { PlexTestConnectionResponseSchema } from '@schemas/plex/test-connection.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/test-connection',
    {
      schema: {
        summary: 'Test Plex server connection',
        operationId: 'testPlexConnection',
        description:
          'Test connectivity to the Plex server address Pulsarr uses, saved or automatic',
        response: {
          200: PlexTestConnectionResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        return await fastify.plexServerService.testConnection()
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
