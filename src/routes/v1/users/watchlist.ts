import {
  type GetUserWatchlistError,
  GetUserWatchlistErrorSchema,
  GetUserWatchlistParamsSchema,
  type GetUserWatchlistResponse,
  GetUserWatchlistResponseSchema,
} from '@schemas/users/watchlist.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const watchlistRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: z.infer<typeof GetUserWatchlistParamsSchema>
    Reply: GetUserWatchlistResponse | GetUserWatchlistError
  }>(
    '/:userId/watchlist',
    {
      schema: {
        summary: 'Get user watchlist items',
        operationId: 'getUserWatchlist',
        description:
          'Fetch all watchlist items for a specific user by their ID',
        params: GetUserWatchlistParamsSchema,
        response: {
          200: GetUserWatchlistResponseSchema,
          404: GetUserWatchlistErrorSchema,
          500: GetUserWatchlistErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params

        // Check if user exists
        const user = await fastify.db.getUser(userId)
        if (!user) {
          const errorResponse: GetUserWatchlistError = {
            success: false,
            message: 'User not found',
          }
          return reply.notFound(errorResponse.message)
        }

        // Get watchlist items using the database service method
        const watchlistItems =
          await fastify.db.getAllWatchlistItemsForUser(userId)

        // Transform the watchlist items to match our schema
        const transformedItems = watchlistItems.map((item) => ({
          title: item.title,
          key: item.key,
          type: item.type,
          thumb: item.thumb || null,
          guids: Array.isArray(item.guids) ? item.guids : [],
          genres: Array.isArray(item.genres) ? item.genres : [],
          status: item.status,
          added: item.added || null,
        }))

        const response: GetUserWatchlistResponse = {
          success: true,
          message: 'User watchlist fetched successfully',
          data: {
            user: {
              id: user.id,
              name: user.name,
            },
            watchlistItems: transformedItems,
            total: transformedItems.length,
          },
        }

        return reply.status(200).send(response)
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch user watchlist',
        })
        const errorResponse: GetUserWatchlistError = {
          success: false,
          message: 'Failed to fetch user watchlist',
        }
        return reply.internalServerError(errorResponse.message)
      }
    },
  )
}

export default watchlistRoute
