import {
  PingErrorSchema,
  PingSuccessSchema,
} from '@schemas/plex/ping.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import type { z } from 'zod'

const PING_SUCCESS_RESPONSE: z.infer<typeof PingSuccessSchema> = {
  success: true,
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/ping',
    {
      schema: {
        summary: 'Test Plex server connection',
        operationId: 'pingPlex',
        description: 'Verifies connectivity to the configured Plex server',
        response: {
          200: PingSuccessSchema,
          401: PingErrorSchema,
          500: PingErrorSchema,
          502: PingErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.plexWatchlist.pingPlex()
        if (result === 'rejected') {
          return reply.unauthorized('Plex did not accept the token')
        }
        if (result === 'unreachable') {
          return reply.badGateway('Plex could not be reached')
        }
        return PING_SUCCESS_RESPONSE
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to ping Plex server',
        })
        return reply.internalServerError('Failed to connect to Plex')
      }
    },
  )
}

export default plugin
