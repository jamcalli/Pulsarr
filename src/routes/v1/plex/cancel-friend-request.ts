import { cancelFriendRequestSchema } from '@schemas/plex/cancel-friend-request.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/cancel-friend-request',
    schema: cancelFriendRequestSchema,
    handler: async (request, reply) => {
      try {
        const { uuid } = request.body
        const result = await fastify.plexWatchlist.cancelFriendRequest(uuid)

        if (!result.success) {
          return reply.badRequest('Failed to cancel friend request')
        }

        return {
          success: true,
          message: `Friend request canceled for user ${uuid}`,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to cancel friend request',
        })
        return reply.internalServerError('Unable to cancel friend request')
      }
    },
  })
}

export default plugin
