import {
  BulkQuotaOperationResponseSchema,
  BulkQuotaOperationSchema,
  BulkQuotaStatusResponseSchema,
  CreateUserQuotaSchema,
  DailyStatsListResponseSchema,
  GetDailyStatsQuerySchema,
  GetQuotaUsageQuerySchema,
  GetUsersWithQuotasResponseSchema,
  QuotaErrorSchema,
  QuotaStatusGetResponseSchema,
  QuotaSuccessResponseSchema,
  QuotaUsageListResponseSchema,
  UpdateSeparateQuotasSchema,
  UpdateUserQuotaSchema,
  UserQuotaCreateResponseSchema,
  UserQuotaGetResponseSchema,
  UserQuotaUpdateResponseSchema,
} from '@schemas/quota/quota.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

// Helper to create quota success responses
function createQuotaSuccess(
  message: string,
): z.infer<typeof QuotaSuccessResponseSchema> {
  return { success: true, message }
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Create user quota
  fastify.post(
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
          return reply.badRequest('User not found')
        }

        // Check if quotas already exist
        const existingQuotas = await fastify.db.getUserQuotas(
          request.body.userId,
        )
        if (existingQuotas.movieQuota || existingQuotas.showQuota) {
          return reply.conflict('User already has quota configurations')
        }

        // Create both movie and show quotas with the same settings
        const userQuotas = await fastify.quotaService.createUserQuotas(
          request.body.userId,
          request.body.quotaType,
          request.body.quotaLimit,
          request.body.bypassApproval,
        )

        reply.status(201)
        return {
          success: true,
          message: 'User quotas created successfully',
          userQuotas,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create user quota',
          context: { userId: request.body.userId },
        })
        return reply.internalServerError('Failed to create user quota')
      }
    },
  )

  // Get user quota by user ID
  fastify.get(
    '/users/:userId',
    {
      schema: {
        summary: 'Get user quotas',
        operationId: 'getUserQuotas',
        description: 'Get quota configurations for a specific user',
        params: z.object({
          userId: z.string(),
        }),
        response: {
          200: UserQuotaGetResponseSchema,
          404: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)
        const userQuotas = await fastify.db.getUserQuotas(userId)

        if (!userQuotas.movieQuota && !userQuotas.showQuota) {
          return reply.notFound('User quotas not found')
        }

        return {
          success: true,
          message: 'User quotas retrieved successfully',
          userQuotas,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get user quota',
          context: { userId: request.params.userId },
        })
        return reply.internalServerError('Failed to retrieve user quota')
      }
    },
  )

  // Update user quota
  fastify.patch(
    '/users/:userId',
    {
      schema: {
        summary: 'Update user quotas',
        operationId: 'updateUserQuotas',
        description: 'Update quota configurations for a specific user',
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

        const existingQuotas = await fastify.db.getUserQuotas(userId)
        if (!existingQuotas.movieQuota && !existingQuotas.showQuota) {
          return reply.notFound('User quotas not found')
        }

        // Update both movie and show quotas with the same settings
        const updateData = {
          quotaType: request.body.quotaType,
          quotaLimit: request.body.quotaLimit,
          bypassApproval: request.body.bypassApproval,
        }

        const [movieQuota, showQuota] = await Promise.all([
          existingQuotas.movieQuota
            ? fastify.db.updateUserQuota(userId, 'movie', updateData)
            : undefined,
          existingQuotas.showQuota
            ? fastify.db.updateUserQuota(userId, 'show', updateData)
            : undefined,
        ])

        if (!movieQuota && !showQuota) {
          throw new Error('Failed to update user quotas')
        }

        const response: z.infer<typeof UserQuotaUpdateResponseSchema> = {
          success: true,
          message: 'User quotas updated successfully',
          userQuotas: {
            userId,
            ...(movieQuota && { movieQuota }),
            ...(showQuota && { showQuota }),
          },
        }
        return response
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update user quota',
          context: { userId: request.params.userId },
        })
        return reply.internalServerError('Failed to update user quota')
      }
    },
  )

  // Update separate movie and show quotas
  fastify.patch(
    '/users/:userId/separate',
    {
      schema: {
        summary: 'Update separate movie and show quotas',
        operationId: 'updateSeparateUserQuotas',
        description:
          'Update movie and show quota configurations separately for a user',
        params: z.object({
          userId: z.string(),
        }),
        body: UpdateSeparateQuotasSchema,
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
        const { movieQuota, showQuota } = request.body

        const existingQuotas = await fastify.db.getUserQuotas(userId)

        let movieResult = existingQuotas.movieQuota
        let showResult = existingQuotas.showQuota

        // Handle movie quota
        if (movieQuota) {
          if (movieQuota.enabled) {
            // Create or update movie quota
            const movieData = {
              quotaType: movieQuota.quotaType,
              quotaLimit: movieQuota.quotaLimit,
              bypassApproval: movieQuota.bypassApproval ?? false,
            }

            if (existingQuotas.movieQuota) {
              movieResult =
                (await fastify.db.updateUserQuota(
                  userId,
                  'movie',
                  movieData,
                )) || undefined
            } else {
              if (!movieData.quotaType || !movieData.quotaLimit) {
                throw new Error('Movie quota type and limit are required')
              }
              movieResult = await fastify.db.createUserQuota({
                userId,
                contentType: 'movie',
                quotaType: movieData.quotaType,
                quotaLimit: movieData.quotaLimit,
                bypassApproval: movieData.bypassApproval,
              })
            }
          } else if (existingQuotas.movieQuota) {
            // Delete movie quota if it exists but is disabled
            await fastify.db.deleteUserQuota(userId, 'movie')
            movieResult = undefined
          }
        }

        // Handle show quota
        if (showQuota) {
          if (showQuota.enabled) {
            // Create or update show quota
            const showData = {
              quotaType: showQuota.quotaType,
              quotaLimit: showQuota.quotaLimit,
              bypassApproval: showQuota.bypassApproval ?? false,
            }

            if (existingQuotas.showQuota) {
              showResult =
                (await fastify.db.updateUserQuota(userId, 'show', showData)) ||
                undefined
            } else {
              if (!showData.quotaType || !showData.quotaLimit) {
                throw new Error('Show quota type and limit are required')
              }
              showResult = await fastify.db.createUserQuota({
                userId,
                contentType: 'show',
                quotaType: showData.quotaType,
                quotaLimit: showData.quotaLimit,
                bypassApproval: showData.bypassApproval,
              })
            }
          } else if (existingQuotas.showQuota) {
            // Delete show quota if it exists but is disabled
            await fastify.db.deleteUserQuota(userId, 'show')
            showResult = undefined
          }
        }

        return {
          success: true,
          message: 'User quotas updated successfully',
          userQuotas: {
            userId,
            movieQuota: movieResult,
            showQuota: showResult,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update separate user quotas',
          context: { userId: request.params.userId },
        })
        return reply.internalServerError('Failed to update user quotas')
      }
    },
  )

  // Delete user quota
  fastify.delete(
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
          200: QuotaSuccessResponseSchema,
          404: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const userId = Number.parseInt(request.params.userId, 10)
        const deleted = await fastify.db.deleteAllUserQuotas(userId)

        if (!deleted) {
          return reply.notFound('User quotas not found')
        }

        return createQuotaSuccess('User quotas deleted successfully')
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to delete user quota',
          context: { userId: request.params.userId },
        })
        return reply.internalServerError('Failed to delete user quota')
      }
    },
  )

  // Get all users with quotas
  fastify.get(
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
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get users with quotas',
        })
        return reply.internalServerError('Failed to retrieve users with quotas')
      }
    },
  )

  // Get quota status for a user
  fastify.get(
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

        const quotaStatus = contentType
          ? await fastify.db.getQuotaStatus(userId, contentType)
          : null

        return {
          success: true,
          message: 'Quota status retrieved successfully',
          quotaStatus,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get quota status',
          context: { userId: request.params.userId },
        })
        return reply.internalServerError('Failed to retrieve quota status')
      }
    },
  )

  // Get quota status for multiple users
  fastify.post(
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
          return reply.badRequest('User IDs array cannot be empty')
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
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get bulk quota status',
          context: { userIds: request.body.userIds },
        })
        return reply.internalServerError('Failed to retrieve bulk quota status')
      }
    },
  )

  // Record quota usage
  fastify.post(
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
          requestDate: z.iso.datetime().optional(),
        }),
        response: {
          200: QuotaSuccessResponseSchema,
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

        return createQuotaSuccess('Quota usage recorded successfully')
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to record quota usage',
          context: {
            userId: request.params.userId,
            contentType: request.body.contentType,
          },
        })
        return reply.internalServerError('Failed to record quota usage')
      }
    },
  )

  // Get quota usage history
  fastify.get(
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

        const [quotaUsage, total] = await Promise.all([
          fastify.db.getQuotaUsageHistory(
            userId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            contentType,
            limit,
            offset,
          ),
          fastify.db.getQuotaUsageHistoryCount(
            userId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
            contentType,
          ),
        ])

        return {
          success: true,
          message: 'Quota usage history retrieved successfully',
          quotaUsage,
          total,
          limit,
          offset,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get quota usage history',
          context: { userId: request.query.userId },
        })
        return reply.internalServerError(
          'Failed to retrieve quota usage history',
        )
      }
    },
  )

  // Get daily usage statistics
  fastify.get(
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
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get daily usage stats',
          context: { userId: request.query.userId },
        })
        return reply.internalServerError(
          'Failed to retrieve daily usage statistics',
        )
      }
    },
  )

  // Bulk quota operations
  fastify.patch(
    '/users/bulk',
    {
      schema: {
        summary: 'Bulk quota operations',
        operationId: 'bulkQuotaOperations',
        description:
          'Perform bulk quota operations on multiple users (update or delete)',
        body: BulkQuotaOperationSchema,
        response: {
          200: BulkQuotaOperationResponseSchema,
          400: QuotaErrorSchema,
          500: QuotaErrorSchema,
        },
        tags: ['Quota'],
      },
    },
    async (request, reply) => {
      try {
        const { userIds, operation, movieQuota, showQuota } = request.body

        if (userIds.length === 0) {
          return reply.badRequest('User IDs array cannot be empty')
        }

        let result: { processedCount: number; failedIds: number[] }

        if (operation === 'delete') {
          // Delete all quotas for the specified users
          result = await fastify.db.bulkDeleteQuotas(userIds)
        } else {
          // Update/create quotas for the specified users
          if (!movieQuota && !showQuota) {
            return reply.badRequest(
              'At least one quota configuration (movie or show) must be provided for update operation',
            )
          }

          result = await fastify.db.bulkUpdateQuotas(
            userIds,
            movieQuota,
            showQuota,
          )
        }

        return {
          success: true,
          message: `${operation === 'delete' ? 'Deleted' : 'Updated'} quotas for ${result.processedCount} of ${userIds.length} users`,
          processedCount: result.processedCount,
          ...(result.failedIds.length > 0
            ? { failedIds: result.failedIds }
            : {}),
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to perform bulk quota operation',
          context: {
            userIds: request.body.userIds,
            operation: request.body.operation,
          },
        })
        return reply.internalServerError(
          'Failed to perform bulk quota operation',
        )
      }
    },
  )

  // Cleanup old quota usage records
  fastify.delete(
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
          200: QuotaSuccessResponseSchema,
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

        return createQuotaSuccess(
          `Cleaned up ${deletedCount} old quota usage records`,
        )
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to cleanup quota usage',
          context: { olderThanDays: request.query.olderThanDays },
        })
        return reply.internalServerError(
          'Failed to cleanup quota usage records',
        )
      }
    },
  )
}

export default plugin
