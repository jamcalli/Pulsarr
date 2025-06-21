import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  CreateUserQuotaSchema,
  UpdateUserQuotaSchema,
  UserQuotaCreateResponseSchema,
  UserQuotaUpdateResponseSchema,
  GetUsersWithQuotasResponseSchema,
  QuotaStatusGetResponseSchema,
  BulkQuotaStatusResponseSchema,
  QuotaUsageListResponseSchema,
  DailyStatsListResponseSchema,
  GetQuotaUsageQuerySchema,
  GetDailyStatsQuerySchema,
  QuotaErrorSchema,
} from '@schemas/quota/quota.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Create user quota
  fastify.post<{
    Body: z.infer<typeof CreateUserQuotaSchema>
    Reply:
      | z.infer<typeof UserQuotaCreateResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/users',
    {
      schema: {
        summary: 'Create user quota',
        operationId: 'createUserQuota',
        description: 'Create a quota configuration for a user',
        body: CreateUserQuotaSchema,
        response: {
          201: UserQuotaCreateResponseSchema,
          400: QuotaErrorSchema,
          409: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        // Check if user exists
        const user = await fastify.db.getUser(request.body.userId)
        if (!user) {
          reply.status(400)
          return {
            success: false,
            message: 'User not found',
          }
        }

        // Check if quota already exists
        const existingQuota = await fastify.db.getUserQuota(request.body.userId)
        if (existingQuota) {
          reply.status(409)
          return {
            success: false,
            message: 'User already has a quota configuration',
          }
        }

        const userQuota = await fastify.db.createUserQuota({
          userId: request.body.userId,
          quotaType: request.body.quotaType,
          quotaLimit: request.body.quotaLimit,
          bypassApproval: request.body.bypassApproval,
        })

        reply.status(201)
        return {
          success: true,
          message: 'User quota created successfully',
          userQuota,
        }
      } catch (error) {
        fastify.log.error('Error creating user quota:', error)
        return reply.internalServerError('Failed to create user quota')
      }
    },
  )

  // Get user quota by user ID
  fastify.get<{
    Params: { userId: string }
    Reply:
      | z.infer<typeof UserQuotaCreateResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/users/:userId',
    {
      schema: {
        summary: 'Get user quota',
        operationId: 'getUserQuota',
        description: 'Get quota configuration for a specific user',
        params: z.object({
          userId: z.string(),
        }),
        response: {
          200: UserQuotaCreateResponseSchema,
          404: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)
        const userQuota = await fastify.db.getUserQuota(userId)

        if (!userQuota) {
          reply.status(404)
          return {
            success: false,
            message: 'User quota not found',
          }
        }

        return {
          success: true,
          message: 'User quota retrieved successfully',
          userQuota,
        }
      } catch (error) {
        fastify.log.error('Error getting user quota:', error)
        return reply.internalServerError('Failed to retrieve user quota')
      }
    },
  )

  // Update user quota
  fastify.patch<{
    Params: { userId: string }
    Body: z.infer<typeof UpdateUserQuotaSchema>
    Reply:
      | z.infer<typeof UserQuotaUpdateResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/users/:userId',
    {
      schema: {
        summary: 'Update user quota',
        operationId: 'updateUserQuota',
        description: 'Update quota configuration for a specific user',
        params: z.object({
          userId: z.string(),
        }),
        body: UpdateUserQuotaSchema,
        response: {
          200: UserQuotaUpdateResponseSchema,
          404: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)

        const existingQuota = await fastify.db.getUserQuota(userId)
        if (!existingQuota) {
          reply.status(404)
          return {
            success: false,
            message: 'User quota not found',
          }
        }

        const userQuota = await fastify.db.updateUserQuota(userId, {
          quotaType: request.body.quotaType,
          quotaLimit: request.body.quotaLimit,
          bypassApproval: request.body.bypassApproval,
        })

        if (!userQuota) {
          throw new Error('Failed to update user quota')
        }

        return {
          success: true,
          message: 'User quota updated successfully',
          userQuota,
        }
      } catch (error) {
        fastify.log.error('Error updating user quota:', error)
        return reply.internalServerError('Failed to update user quota')
      }
    },
  )

  // Delete user quota
  fastify.delete<{
    Params: { userId: string }
    Reply: z.infer<typeof QuotaErrorSchema>
  }>(
    '/users/:userId',
    {
      schema: {
        summary: 'Delete user quota',
        operationId: 'deleteUserQuota',
        description: 'Delete quota configuration for a specific user',
        params: z.object({
          userId: z.string(),
        }),
        response: {
          200: QuotaErrorSchema,
          404: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)
        const deleted = await fastify.db.deleteUserQuota(userId)

        if (!deleted) {
          reply.status(404)
          return {
            success: false,
            message: 'User quota not found',
          }
        }

        return {
          success: true,
          message: 'User quota deleted successfully',
        }
      } catch (error) {
        fastify.log.error('Error deleting user quota:', error)
        return reply.internalServerError('Failed to delete user quota')
      }
    },
  )

  // Get all users with quotas
  fastify.get<{
    Reply:
      | z.infer<typeof GetUsersWithQuotasResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/users',
    {
      schema: {
        summary: 'Get all users with quotas',
        operationId: 'getUsersWithQuotas',
        description: 'Get all users that have quota configurations',
        response: {
          200: GetUsersWithQuotasResponseSchema,
          500: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userQuotas = await fastify.db.getUsersWithQuotas()

        return {
          success: true,
          message: 'Users with quotas retrieved successfully',
          userQuotas,
        }
      } catch (error) {
        fastify.log.error('Error getting users with quotas:', error)
        return reply.internalServerError('Failed to retrieve users with quotas')
      }
    },
  )

  // Get quota status for a user
  fastify.get<{
    Params: { userId: string }
    Querystring: { contentType?: 'movie' | 'show' }
    Reply:
      | z.infer<typeof QuotaStatusGetResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/users/:userId/status',
    {
      schema: {
        summary: 'Get user quota status',
        operationId: 'getUserQuotaStatus',
        description: 'Get current quota status for a user',
        params: z.object({
          userId: z.string(),
        }),
        querystring: z.object({
          contentType: z.enum(['movie', 'show']).optional(),
        }),
        response: {
          200: QuotaStatusGetResponseSchema,
          500: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)
        const { contentType } = request.query

        const quotaStatus = await fastify.db.getQuotaStatus(userId, contentType)

        return {
          success: true,
          message: 'Quota status retrieved successfully',
          quotaStatus,
        }
      } catch (error) {
        fastify.log.error('Error getting quota status:', error)
        return reply.internalServerError('Failed to retrieve quota status')
      }
    },
  )

  // Get quota status for multiple users
  fastify.post<{
    Body: { userIds: number[]; contentType?: 'movie' | 'show' }
    Reply:
      | z.infer<typeof BulkQuotaStatusResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/users/status/bulk',
    {
      schema: {
        summary: 'Get quota status for multiple users',
        operationId: 'getBulkUserQuotaStatus',
        description:
          'Get current quota status for multiple users in a single request',
        body: z.object({
          userIds: z.array(z.number()),
          contentType: z.enum(['movie', 'show']).optional(),
        }),
        response: {
          200: BulkQuotaStatusResponseSchema,
          400: QuotaErrorSchema,
          500: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const { userIds, contentType } = request.body

        if (!userIds || userIds.length === 0) {
          reply.status(400)
          return {
            success: false,
            message: 'User IDs array cannot be empty',
          }
        }

        // Use bulk method to fetch quota status for all users efficiently
        const quotaStatuses = await fastify.db.getBulkQuotaStatus(
          userIds,
          contentType,
        )

        return {
          success: true,
          message: 'Bulk quota status retrieved successfully',
          quotaStatuses,
        }
      } catch (error) {
        fastify.log.error('Error getting bulk quota status:', error)
        return reply.internalServerError('Failed to retrieve bulk quota status')
      }
    },
  )

  // Record quota usage
  fastify.post<{
    Params: { userId: string }
    Body: { contentType: 'movie' | 'show'; requestDate?: string }
    Reply: z.infer<typeof QuotaErrorSchema>
  }>(
    '/users/:userId/usage',
    {
      schema: {
        summary: 'Record quota usage',
        operationId: 'recordQuotaUsage',
        description: 'Record quota usage for a user',
        params: z.object({
          userId: z.string(),
        }),
        body: z.object({
          contentType: z.enum(['movie', 'show']),
          requestDate: z.string().datetime().optional(),
        }),
        response: {
          200: QuotaErrorSchema,
          400: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)
        const { contentType, requestDate } = request.body

        await fastify.db.recordQuotaUsage(
          userId,
          contentType,
          requestDate ? new Date(requestDate) : undefined,
        )

        return {
          success: true,
          message: 'Quota usage recorded successfully',
        }
      } catch (error) {
        fastify.log.error('Error recording quota usage:', error)
        return reply.internalServerError('Failed to record quota usage')
      }
    },
  )

  // Get quota usage history
  fastify.get<{
    Querystring: z.infer<typeof GetQuotaUsageQuerySchema>
    Reply:
      | z.infer<typeof QuotaUsageListResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/usage',
    {
      schema: {
        summary: 'Get quota usage history',
        operationId: 'getQuotaUsageHistory',
        description: 'Get quota usage history for a user',
        querystring: GetQuotaUsageQuerySchema,
        response: {
          200: QuotaUsageListResponseSchema,
          400: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const { userId, startDate, endDate, contentType, limit, offset } =
          request.query

        const quotaUsage = await fastify.db.getQuotaUsageHistory(
          userId,
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined,
          contentType,
        )

        // For total count, we'd need to modify the service method to return count
        // For now, return the current results length as total
        const total = quotaUsage.length

        return {
          success: true,
          message: 'Quota usage history retrieved successfully',
          quotaUsage,
          total,
          limit,
          offset,
        }
      } catch (error) {
        fastify.log.error('Error getting quota usage history:', error)
        return reply.internalServerError(
          'Failed to retrieve quota usage history',
        )
      }
    },
  )

  // Get daily usage statistics
  fastify.get<{
    Querystring: z.infer<typeof GetDailyStatsQuerySchema>
    Reply:
      | z.infer<typeof DailyStatsListResponseSchema>
      | z.infer<typeof QuotaErrorSchema>
  }>(
    '/stats/daily',
    {
      schema: {
        summary: 'Get daily usage statistics',
        operationId: 'getDailyUsageStats',
        description: 'Get daily usage statistics for a user',
        querystring: GetDailyStatsQuerySchema,
        response: {
          200: DailyStatsListResponseSchema,
          400: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const { userId, days } = request.query

        const dailyStats = await fastify.db.getDailyUsageStats(userId, days)

        return {
          success: true,
          message: 'Daily usage statistics retrieved successfully',
          dailyStats,
        }
      } catch (error) {
        fastify.log.error('Error getting daily usage stats:', error)
        return reply.internalServerError(
          'Failed to retrieve daily usage statistics',
        )
      }
    },
  )

  // Cleanup old quota usage records
  fastify.delete<{
    Querystring: { olderThanDays?: number }
    Reply: z.infer<typeof QuotaErrorSchema>
  }>(
    '/usage/cleanup',
    {
      schema: {
        summary: 'Cleanup old quota usage',
        operationId: 'cleanupOldQuotaUsage',
        description: 'Clean up old quota usage records',
        querystring: z.object({
          olderThanDays: z.coerce.number().min(1).default(90),
        }),
        response: {
          200: QuotaErrorSchema,
          500: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const { olderThanDays } = request.query

        const deletedCount =
          await fastify.db.cleanupOldQuotaUsage(olderThanDays)

        return {
          success: true,
          message: `Cleaned up ${deletedCount} old quota usage records`,
        }
      } catch (error) {
        fastify.log.error('Error cleaning up quota usage:', error)
        return reply.internalServerError(
          'Failed to cleanup quota usage records',
        )
      }
    },
  )
}

export default plugin
