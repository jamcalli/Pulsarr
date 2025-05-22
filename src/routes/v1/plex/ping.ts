import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  PingSuccessSchema,
  PingErrorSchema,
} from '@schemas/plex/ping.schema.js'

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
    async (_request, reply) => {
      try {
        const success = await fastify.plexWatchlist.pingPlex()
        return { success }
      } catch (error) {
        fastify.log.error(error)
        return reply.internalServerError('Failed to connect to Plex')
      }
    },
  )
}
