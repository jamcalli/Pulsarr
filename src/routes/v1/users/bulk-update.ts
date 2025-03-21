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
        // Check if this is a placeholder email operation
        if (updates.email === 'placeholder@placeholder.com') {
          // Special case: reset emails to username@placeholder.com for each user
          const failedIds = []
          let updatedCount = 0

          // Process each user individually
          for (const userId of userIds) {
            try {
              const user = await fastify.db.getUser(userId)

              if (user) {
                // Create a personalized update for this specific user
                const userUpdates = {
                  ...updates, // Include all other updates
                  email: `${user.name}@placeholder.com`, // Personalized placeholder email
                  notify_email: false, // Always disable email notifications for placeholder emails
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
              fastify.log.error(`Error updating user ${userId}:`, err)
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

        // Validate notificaiton preferences against user data
        const isUpdatingNotifications =
          updates.notify_email !== undefined ||
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

                // Validate email notification settings
                if (updates.notify_email !== undefined) {
                  const userEmail = user.email || ''
                  // Only enable email notifications if user has a valid non-placeholder email
                  if (
                    updates.notify_email &&
                    (!userEmail || userEmail.endsWith('@placeholder.com'))
                  ) {
                    userUpdates.notify_email = false
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
              fastify.log.error(`Error updating user ${userId}:`, err)
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
        fastify.log.error('Error in bulk user update:', error)
        throw reply.internalServerError('Failed to update users')
      }
    },
  )
}

export default plugin
