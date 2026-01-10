import { ErrorSchema } from '@schemas/common/error.schema.js'
import {
  RecentRequestsQuerySchema,
  RecentRequestsResponseSchema,
} from '@schemas/dashboard/recent-requests.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/recent-requests',
    {
      schema: {
        summary: 'Get recent requests',
        operationId: 'getRecentRequests',
        description:
          'Retrieve recent requests for the dashboard carousel, combining pending approvals and routed watchlist items',
        querystring: RecentRequestsQuerySchema,
        response: {
          200: RecentRequestsResponseSchema,
          500: ErrorSchema,
        },
        tags: ['Statistics'],
      },
    },
    async (request, reply) => {
      try {
        const { limit, status } = request.query
        const items = await fastify.db.getRecentRequests(limit, status)

        return {
          success: true,
          items,
        }
      } catch (err) {
        logRouteError(fastify.log, request, err, {
          message: 'Failed to fetch recent requests',
        })
        return reply.internalServerError('Unable to fetch recent requests')
      }
    },
  )
}

export default plugin
