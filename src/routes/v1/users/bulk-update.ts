import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  UserErrorSchema,
  BulkUpdateResponseSchema,
  BulkUpdateRequestSchema,
} from '@schemas/users/users.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.patch<{
    Body: z.infer<typeof BulkUpdateRequestSchema>
    Reply:
      | z.infer<typeof BulkUpdateResponseSchema>
      | z.infer<typeof UserErrorSchema>
  }>(
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
        // Validate notification preferences against user data
        const isUpdatingNotifications =
          updates.notify_apprise !== undefined ||
          updates.notify_discord !== undefined

        if (isUpdatingNotifications) {
          // Process each user individually to check notification settings
          const failedIds = []
          let updatedCount = 0

          for (const userId of userIds) {
            try {
              const user = await fastify.db.getUser(userId)

              if (user) {
                // Create a user-specific update object
                const userUpdates = { ...updates }

                // Validate apprise notification settings
                if (updates.notify_apprise !== undefined) {
                  const userApprise = user.apprise || ''
                  // Only enable apprise notifications if user has a valid apprise value
                  if (updates.notify_apprise && !userApprise) {
                    userUpdates.notify_apprise = false
                  }
                }

                // Validate Discord notification settings
                if (updates.notify_discord !== undefined) {
                  // Only enable Discord notifications if user has a Discord ID
                  if (updates.notify_discord && !user.discord_id) {
                    userUpdates.notify_discord = false
                  }
                }

                // Apply the update
                const result = await fastify.db.updateUser(userId, userUpdates)

                if (result) {
                  updatedCount++
                } else {
                  failedIds.push(userId)
                }
              } else {
                failedIds.push(userId)
              }
            } catch (err) {
              fastify.log.error(
                { error: err },
                `Error updating user ${userId}:`,
              )
              failedIds.push(userId)
            }
          }

          return {
            success: updatedCount > 0,
            message: `Updated ${updatedCount} of ${userIds.length} users`,
            updatedCount,
            ...(failedIds.length > 0 ? { failedIds } : {}),
          }
        }

        // Regular bulk update for changes not affecting notifications
        const result = await fastify.db.bulkUpdateUsers(userIds, updates)

        return {
          success: result.updatedCount > 0,
          message: `Updated ${result.updatedCount} of ${userIds.length} users`,
          updatedCount: result.updatedCount,
          ...(result.failedIds.length > 0
            ? { failedIds: result.failedIds }
            : {}),
        }
      } catch (error) {
        fastify.log.error({ error }, 'Error in bulk user update:')
        return reply.internalServerError('Failed to update users')
      }
    },
  )
}

export default plugin
