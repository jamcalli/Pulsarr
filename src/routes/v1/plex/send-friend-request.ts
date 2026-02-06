import { sendFriendRequestSchema } from '@schemas/plex/send-friend-request.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.route({
    method: 'POST',
    url: '/send-friend-request',
    schema: sendFriendRequestSchema,
    handler: async (request, reply) => {
      try {
        const { uuid } = request.body
        const result = await fastify.plexWatchlist.sendFriendRequest(uuid)

        if (!result.success) {
          return reply.badRequest('Failed to send friend request')
        }

        return {
          success: true,
          message: `Friend request sent to user ${uuid}`,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to send friend request',
        })
        return reply.internalServerError('Unable to send friend request')
      }
    },
  })
}

export default plugin
