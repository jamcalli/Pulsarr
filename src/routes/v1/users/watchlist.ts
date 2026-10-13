import {
  GetUserWatchlistErrorSchema,
  GetUserWatchlistParamsSchema,
  type GetUserWatchlistResponse,
  GetUserWatchlistResponseSchema,
} from '@schemas/users/watchlist.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const watchlistRoute: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/:userId/watchlist',
    {
      schema: {
        summary: 'Get user watchlist items',
        operationId: 'getUserWatchlist',
        description:
          'Fetch the pending approvals and watchlist items of one user, newest first',
        params: GetUserWatchlistParamsSchema,
        response: {
          200: GetUserWatchlistResponseSchema,
          400: GetUserWatchlistErrorSchema,
          404: GetUserWatchlistErrorSchema,
          500: GetUserWatchlistErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params

        const user = await fastify.db.getUser(userId)
        if (!user) {
          return reply.notFound('User not found')
        }

        const items = await fastify.db.getRecentRequests({
          userId,
          includeUnrouted: true,
        })

        const response: GetUserWatchlistResponse = {
          success: true,
          message: 'User watchlist fetched successfully',
          data: {
            user: {
              id: user.id,
              name: user.name,
            },
            items,
            total: items.length,
          },
        }

        return reply.status(200).send(response)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch user watchlist',
        })
        return reply.internalServerError('Failed to fetch user watchlist')
      }
    },
  )
}

export default watchlistRoute
