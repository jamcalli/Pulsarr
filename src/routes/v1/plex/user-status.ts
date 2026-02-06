import { userStatusSchema } from '@schemas/plex/user-status.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/user-status',
    {
      schema: userStatusSchema,
    },
    async (request, reply) => {
      try {
        return await fastify.plexWatchlist.getClassifiedUsers()
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get Plex user status',
        })
        return reply.internalServerError('Unable to get Plex user status')
      }
    },
  )
}

export default plugin
