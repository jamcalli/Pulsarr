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
      const { userIds, updates } = request.body

      try {
        const isUpdatingNotifications =
          updates.notify_apprise !== undefined ||
          updates.notify_discord !== undefined

        if (isUpdatingNotifications) {
          const failedIds: number[] = []
          let updatedCount = 0

          for (const userId of userIds) {
            try {
              const user = await fastify.db.getUser(userId)

              if (user) {
                const userUpdates = { ...updates }

                if (updates.notify_apprise !== undefined) {
                  const userApprise = user.apprise || ''
                  // Only enable apprise notifications if user has a valid apprise value
                  if (updates.notify_apprise && !userApprise) {
                    userUpdates.notify_apprise = false
                  }
                }

                if (updates.notify_discord !== undefined) {
                  // Only enable Discord notifications if user has a Discord ID
                  if (updates.notify_discord && !user.discord_id) {
                    userUpdates.notify_discord = false
                  }
                }

                const result = await fastify.db.updateUser(userId, userUpdates)

                if (result) {
                  updatedCount++
                } else {
                  failedIds.push(userId)
                }
              } else {
                failedIds.push(userId)
              }
            } catch (error) {
              logRouteError(fastify.log, request, error, {
                message: 'Failed to update individual user',
                context: { userId },
              })
              failedIds.push(userId)
            }
          }

          return {
            success: true,
            message: `Updated ${updatedCount} of ${userIds.length} users`,
            updatedCount,
            ...(failedIds.length > 0 ? { failedIds } : {}),
          }
        }

        // Regular bulk update for changes not affecting notifications
        const result = await fastify.db.bulkUpdateUsers(userIds, updates)

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
