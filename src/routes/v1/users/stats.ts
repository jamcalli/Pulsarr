import {
  GetUserStatsParamsSchema,
  GetUserStatsResponseSchema,
  UserStatsErrorSchema,
} from '@schemas/users/user-stats.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const statsRoute: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/:id/stats',
    {
      schema: {
        summary: 'Get user stats',
        operationId: 'getUserStats',
        description:
          'Count watchlist items by status, notifications sent and pending approvals for one user',
        params: GetUserStatsParamsSchema,
        response: {
          200: GetUserStatsResponseSchema,
          400: UserStatsErrorSchema,
          404: UserStatsErrorSchema,
          500: UserStatsErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params

        const user = await fastify.db.getUser(id)
        if (!user) {
          return reply.notFound('User not found')
        }

        const stats = await fastify.db.getUserStats(id)

        return { success: true, stats }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to fetch user stats',
        })
        return reply.internalServerError('Failed to fetch user stats')
      }
    },
  )
}

export default statsRoute
