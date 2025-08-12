import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  PingSuccessSchema,
  PingErrorSchema,
} from '@schemas/plex/ping.schema.js'
import { logRouteError } from '@utils/route-errors.js'

export const pingRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Reply: z.infer<typeof PingSuccessSchema>
  }>(
    '/ping',
    {
      schema: {
        summary: 'Test Plex server connection',
        operationId: 'pingPlex',
        description: 'Verifies connectivity to the configured Plex server',
        response: {
          200: PingSuccessSchema,
          500: PingErrorSchema,
        },
        tags: ['Plex'],
      },
    },
    async (request, reply) => {
      try {
        const success = await fastify.plexWatchlist.pingPlex()
        return { success }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to ping Plex server',
        })
        return reply.internalServerError('Failed to connect to Plex')
      }
    },
  )
}
