import {
  BulkUpdateRequestSchema,
  BulkUpdateResponseSchema,
  UserErrorSchema,
} from '@schemas/users/users.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.patch(
    '/bulk',
    {
      schema: {
        summary: 'Bulk update users',
        operationId: 'bulkUpdateUsers',
        description: 'Update multiple users with the same changes in bulk',
        body: BulkUpdateRequestSchema,
        response: {
          200: BulkUpdateResponseSchema,
          400: UserErrorSchema,
          500: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      const { userIds } = request.body

      try {
        const result = await fastify.plexWatchlist.bulkUpdateUsers(
          userIds,
          request.body.updates,
        )

        return {
          success: true,
          message: `Updated ${result.updatedCount} of ${userIds.length} users`,
          updatedCount: result.updatedCount,
          ...(result.failedIds.length > 0
            ? { failedIds: result.failedIds }
            : {}),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to perform bulk user update',
        })
        return reply.internalServerError('Failed to update users')
      }
    },
  )
}

export default plugin
