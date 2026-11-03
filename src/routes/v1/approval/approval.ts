import type { ApprovalActionResult } from '@root/types/approval.types.js'
import {
  ApprovalErrorSchema,
  ApprovalIdParamsSchema,
  ApprovalRequestResultSchema,
  ApprovalRequestsListResponseSchema,
  ApprovalStatsResponseSchema,
  ApprovalSuccessResponseSchema,
  BulkApprovalRequestSchema,
  BulkDeleteRequestSchema,
  BulkOperationResponseSchema,
  BulkRejectRequestSchema,
  GetApprovalRequestsQuerySchema,
  UpdateApprovalRequestSchema,
} from '@schemas/approval/approval.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

function replyActionFailure(
  reply: FastifyReply,
  result: Extract<ApprovalActionResult, { success: false }>,
) {
  switch (result.reason) {
    case 'not_found':
      return reply.notFound(result.error)
    case 'invalid_decision':
      return reply.badRequest(result.error)
    case 'invalid_transition':
    case 'no_routing':
    case 'routing_failed':
      return reply.conflict(result.error)
    case 'unavailable':
      return reply.serviceUnavailable(result.error)
    case 'rollback_failed':
      return reply.internalServerError(
        'Routing failed and rollback failed - request may be in inconsistent state',
      )
    case 'error':
      return reply.internalServerError(result.error)
  }
}

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get approval requests (with filtering)
  fastify.get(
    '/requests',
    {
      schema: {
        summary: 'Get approval requests',
        operationId: 'getApprovalRequests',
        description: 'Retrieve approval requests with optional filtering',
        querystring: GetApprovalRequestsQuerySchema,
        response: {
          200: ApprovalRequestsListResponseSchema,
          400: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const {
          status,
          userId,
          contentType,
          triggeredBy,
          search,
          limit,
          offset,
          sortBy,
          sortOrder,
        } = request.query

        const requests = await fastify.db.getApprovalHistory(
          userId,
          status,
          limit,
          offset,
          contentType,
          triggeredBy,
          search,
          sortBy,
          sortOrder,
        )

        const total = await fastify.db.getApprovalHistoryCount(
          userId,
          status,
          contentType,
          triggeredBy,
          search,
        )

        return {
          success: true,
          message: 'Approval requests retrieved successfully',
          approvalRequests: requests.map((request) => {
            const expirationInfo = fastify.approvalService.expirationInfo(
              request.expiresAt,
            )
            return {
              ...request,
              routerRuleId: request.routerRuleId ?? null,
              approvedBy: request.approvedBy ?? null,
              approvalNotes: request.approvalNotes ?? null,
              approvalReason: request.approvalReason ?? null,
              expiresAt: expirationInfo.expiresAt,
              isExpired: expirationInfo.isExpired,
              expirationStatus: expirationInfo.expirationStatus,
              expirationDisplayText: expirationInfo.displayText,
              timeUntilExpiration: expirationInfo.timeUntilExpiration,
            }
          }),
          total,
          limit,
          offset,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get approval requests',
        })
        return reply.internalServerError('Failed to retrieve approval requests')
      }
    },
  )

  // Get specific approval request by ID
  fastify.get(
    '/requests/:id',
    {
      schema: {
        summary: 'Get approval request by ID',
        operationId: 'getApprovalRequestById',
        description: 'Retrieve a specific approval request by its ID',
        params: ApprovalIdParamsSchema,
        response: {
          200: ApprovalRequestResultSchema,
          400: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = request.params.id
        const approvalRequest = await fastify.db.getApprovalRequest(requestId)

        if (!approvalRequest) {
          return reply.notFound('Approval request not found')
        }

        const expirationInfo = fastify.approvalService.expirationInfo(
          approvalRequest.expiresAt,
        )

        return {
          success: true,
          message: 'Approval request retrieved successfully',
          approvalRequest: {
            ...approvalRequest,
            routerRuleId: approvalRequest.routerRuleId ?? null,
            approvedBy: approvalRequest.approvedBy ?? null,
            approvalNotes: approvalRequest.approvalNotes ?? null,
            approvalReason: approvalRequest.approvalReason ?? null,
            expiresAt: expirationInfo.expiresAt,
            isExpired: expirationInfo.isExpired,
            expirationStatus: expirationInfo.expirationStatus,
            expirationDisplayText: expirationInfo.displayText,
            timeUntilExpiration: expirationInfo.timeUntilExpiration,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get approval request',
          requestId: request.params.id,
        })
        return reply.internalServerError('Failed to retrieve approval request')
      }
    },
  )

  // Update approval request routing
  fastify.patch(
    '/requests/:id',
    {
      schema: {
        summary: 'Update approval request routing',
        operationId: 'updateApprovalRequest',
        description:
          'Change the proposed routing on an editable approval request',
        params: ApprovalIdParamsSchema,
        body: UpdateApprovalRequestSchema,
        response: {
          200: ApprovalRequestResultSchema,
          400: ApprovalErrorSchema,
          401: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.approvalService.updateRouting(
          request.params.id,
          request.body.proposedRouterDecision,
        )
        if (!result.success) {
          return replyActionFailure(reply, result)
        }

        const updatedRequest = result.request
        return {
          success: true,
          message: 'Approval request updated successfully',
          approvalRequest: {
            ...updatedRequest,
            routerRuleId: updatedRequest.routerRuleId ?? null,
            approvedBy: updatedRequest.approvedBy ?? null,
            approvalNotes: updatedRequest.approvalNotes ?? null,
            approvalReason: updatedRequest.approvalReason ?? null,
            expiresAt: updatedRequest.expiresAt ?? null,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to update approval request',
          requestId: request.params.id,
        })
        return reply.internalServerError('Failed to update approval request')
      }
    },
  )

  // Delete approval request
  fastify.delete(
    '/requests/:id',
    {
      schema: {
        summary: 'Delete approval request',
        operationId: 'deleteApprovalRequest',
        description: 'Permanently delete an approval request from database',
        params: ApprovalIdParamsSchema,
        response: {
          200: ApprovalSuccessResponseSchema,
          400: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = request.params.id

        const deleted =
          await fastify.approvalService.deleteApprovalRequest(requestId)

        if (!deleted) {
          return reply.notFound('Approval request not found')
        }

        return {
          success: true,
          message: 'Approval request deleted successfully',
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to delete approval request',
          requestId: request.params.id,
        })
        return reply.internalServerError('Failed to delete approval request')
      }
    },
  )

  // Reject approval request
  fastify.post(
    '/requests/:id/reject',
    {
      schema: {
        summary: 'Reject approval request',
        operationId: 'rejectApprovalRequest',
        description: 'Reject an approval request (marks as rejected)',
        params: ApprovalIdParamsSchema,
        body: z.object({
          reason: z.string().optional(),
        }),
        response: {
          200: ApprovalSuccessResponseSchema,
          401: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = request.params.id
        const { reason } = request.body
        const rejectedBy = request.user?.id
        if (!rejectedBy) {
          return reply.unauthorized('User not authenticated')
        }

        const result = await fastify.approvalService.rejectRequest(
          requestId,
          rejectedBy,
          reason,
        )
        if (!result.success) {
          return replyActionFailure(reply, result)
        }

        return {
          success: true,
          message: 'Approval request rejected successfully',
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to reject approval request',
          requestId: request.params.id,
        })
        return reply.internalServerError('Failed to reject approval request')
      }
    },
  )

  // Get approval statistics
  fastify.get(
    '/stats',
    {
      schema: {
        summary: 'Get approval statistics',
        operationId: 'getApprovalStats',
        description: 'Get statistics about approval requests',
        response: {
          200: ApprovalStatsResponseSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const stats = await fastify.db.getApprovalStats()

        return {
          success: true,
          message: 'Approval statistics retrieved successfully',
          stats,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to get approval stats',
        })
        return reply.internalServerError(
          'Failed to retrieve approval statistics',
        )
      }
    },
  )

  // Approve request and execute routing
  fastify.post(
    '/requests/:id/approve',
    {
      schema: {
        summary: 'Approve and execute request',
        operationId: 'approveAndExecuteRequest',
        description:
          'Approve an approval request and execute the proposed routing',
        params: ApprovalIdParamsSchema,
        body: z.object({
          notes: z.string().optional(),
        }),
        response: {
          200: ApprovalSuccessResponseSchema,
          401: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
          503: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = request.params.id
        const { notes } = request.body
        const approvedBy = request.user?.id
        if (!approvedBy) {
          return reply.unauthorized('User not authenticated')
        }

        const result = await fastify.approvalService.approveAndRoute(
          requestId,
          approvedBy,
          notes,
          { checkHealth: true },
        )
        if (!result.success) {
          return replyActionFailure(reply, result)
        }

        return {
          success: true,
          message: 'Approval request approved and executed successfully',
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to approve and execute request',
          requestId: request.params.id,
        })
        return reply.internalServerError(
          'Failed to approve and execute request',
        )
      }
    },
  )

  // Bulk approve requests
  fastify.post(
    '/requests/bulk/approve',
    {
      schema: {
        summary: 'Bulk approve requests',
        operationId: 'bulkApproveRequests',
        description: 'Approve multiple approval requests in batch',
        body: BulkApprovalRequestSchema,
        response: {
          200: BulkOperationResponseSchema,
          400: ApprovalErrorSchema,
          401: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
          503: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { requestIds, notes } = request.body
        const userId = request.user?.id
        if (!userId) {
          return reply.unauthorized('User not authenticated')
        }

        const healthCheck =
          await fastify.approvalService.checkAllInstancesHealth()
        if (!healthCheck.allAvailable) {
          return reply.serviceUnavailable(
            `Cannot process bulk approval: ${healthCheck.unavailable.join(' and ')} instances are unavailable`,
          )
        }

        const result = await fastify.approvalService.batchApprove(
          requestIds,
          userId,
          notes,
        )

        return {
          success: true,
          message: `Bulk approve completed: ${result.approved} successful, ${result.failed.length} failed`,
          result: {
            successful: result.approved,
            failed: result.failed,
            errors: result.errors,
            total: requestIds.length,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to bulk approve requests',
          requestCount: request.body.requestIds.length,
        })
        return reply.internalServerError('Failed to bulk approve requests')
      }
    },
  )

  // Bulk reject requests
  fastify.post(
    '/requests/bulk/reject',
    {
      schema: {
        summary: 'Bulk reject requests',
        operationId: 'bulkRejectRequests',
        description: 'Reject multiple approval requests in batch',
        body: BulkRejectRequestSchema,
        response: {
          200: BulkOperationResponseSchema,
          400: ApprovalErrorSchema,
          401: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { requestIds, reason } = request.body
        const userId = request.user?.id
        if (!userId) {
          return reply.unauthorized('User not authenticated')
        }

        const result = await fastify.approvalService.batchReject(
          requestIds,
          userId,
          reason,
        )

        return {
          success: true,
          message: `Bulk reject completed: ${result.rejected} successful, ${result.failed.length} failed`,
          result: {
            successful: result.rejected,
            failed: result.failed,
            errors: result.errors,
            total: requestIds.length,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to bulk reject requests',
          requestCount: request.body.requestIds.length,
        })
        return reply.internalServerError('Failed to bulk reject requests')
      }
    },
  )

  // Bulk delete requests
  fastify.delete(
    '/requests/bulk/delete',
    {
      schema: {
        summary: 'Bulk delete requests',
        operationId: 'bulkDeleteRequests',
        description: 'Delete multiple approval requests in batch',
        body: BulkDeleteRequestSchema,
        response: {
          200: BulkOperationResponseSchema,
          400: ApprovalErrorSchema,
          500: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { requestIds } = request.body

        const result = await fastify.approvalService.batchDelete(requestIds)

        return {
          success: true,
          message: `Bulk delete completed: ${result.deleted} successful, ${result.failed.length} failed`,
          result: {
            successful: result.deleted,
            failed: result.failed,
            errors: result.errors,
            total: requestIds.length,
          },
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to bulk delete requests',
          requestCount: request.body.requestIds.length,
        })
        return reply.internalServerError('Failed to bulk delete requests')
      }
    },
  )
}

export default plugin
