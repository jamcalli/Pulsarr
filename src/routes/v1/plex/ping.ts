import {
  PingErrorSchema,
  PingSuccessSchema,
} from '@schemas/plex/ping.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const PING_SUCCESS_RESPONSE: z.infer<typeof PingSuccessSchema> = {
  success: true,
}

const plugin: FastifyPluginAsync = async (fastify) => {
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
        await fastify.plexWatchlist.pingPlex()
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
