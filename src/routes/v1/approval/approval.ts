import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  CreateApprovalRequestSchema,
  UpdateApprovalRequestSchema,
  ApprovalRequestCreateResponseSchema,
  ApprovalRequestUpdateResponseSchema,
  ApprovalRequestsListResponseSchema,
  ApprovalStatsResponseSchema,
  GetApprovalRequestsQuerySchema,
  ApprovalErrorSchema,
  BulkApprovalRequestSchema,
  BulkRejectRequestSchema,
  BulkDeleteRequestSchema,
  BulkOperationResponseSchema,
  type BulkApprovalRequest,
  type BulkRejectRequest,
  type BulkDeleteRequest,
  type BulkOperationResponse,
} from '@schemas/approval/approval.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  /**
   * Calculates dynamic expiration info based on current config settings
   */
  const getExpirationInfo = (
    request: { expiresAt?: string | null },
    currentConfig: { approvalExpiration?: { enabled?: boolean } },
  ): {
    expiresAt: string | null
    isExpired: boolean
    timeUntilExpiration: number | null
    expirationStatus: 'active' | 'expiring_soon' | 'expired'
    displayText: string
  } => {
    const config = currentConfig?.approvalExpiration

    // If expiration is disabled, return null values
    if (!config?.enabled || !request.expiresAt) {
      return {
        expiresAt: request.expiresAt ?? null,
        isExpired: false,
        timeUntilExpiration: null,
        expirationStatus: 'active',
        displayText: request.expiresAt
          ? new Date(request.expiresAt).toLocaleString()
          : 'No expiration',
      }
    }

    const now = new Date()
    const expiresAt = new Date(request.expiresAt)
    const timeUntilExpiration = expiresAt.getTime() - now.getTime()
    const hoursUntilExpiration = timeUntilExpiration / (1000 * 60 * 60)

    const isExpired = timeUntilExpiration <= 0
    let expirationStatus: 'active' | 'expiring_soon' | 'expired' = 'active'

    if (isExpired) {
      expirationStatus = 'expired'
    } else if (hoursUntilExpiration <= 24) {
      expirationStatus = 'expiring_soon'
    }

    const displayText = isExpired
      ? `Expired ${Math.abs(Math.floor(hoursUntilExpiration))} hours ago`
      : `Expires: ${expiresAt.toLocaleDateString()}, ${expiresAt.toLocaleTimeString()}`

    return {
      expiresAt: expiresAt.toISOString(),
      isExpired,
      timeUntilExpiration,
      expirationStatus,
      displayText,
    }
  }
  // Create approval request
  fastify.post<{
    Body: z.infer<typeof CreateApprovalRequestSchema>
    Reply:
      | z.infer<typeof ApprovalRequestCreateResponseSchema>
      | z.infer<typeof ApprovalErrorSchema>
  }>(
    '/requests',
    {
      schema: {
        summary: 'Create approval request',
        operationId: 'createApprovalRequest',
        description: 'Create a new approval request for content routing',
        body: CreateApprovalRequestSchema,
        response: {
          201: ApprovalRequestCreateResponseSchema,
          400: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        // Check if approval request already exists for this user and content
        const existingRequest = await fastify.db.getApprovalRequestByContent(
          request.body.userId,
          request.body.contentKey,
        )

        if (existingRequest && existingRequest.status === 'pending') {
          return reply.conflict(
            'Approval request already exists for this content',
          )
        }

        const approvalRequest = await fastify.db.createApprovalRequest({
          userId: request.body.userId,
          contentType: request.body.contentType,
          contentTitle: request.body.contentTitle,
          contentKey: request.body.contentKey,
          contentGuids: request.body.contentGuids || [],
          routerDecision: request.body.routerDecision,
          routerRuleId: request.body.routerRuleId,
          approvalReason: request.body.approvalReason,
          triggeredBy: request.body.triggeredBy,
          expiresAt: request.body.expiresAt || null,
        })

        return reply.code(201).send({
          success: true,
          message: 'Approval request created successfully',
          approvalRequest: {
            ...approvalRequest,
            routerRuleId: approvalRequest.routerRuleId ?? null,
            approvedBy: approvalRequest.approvedBy ?? null,
            approvalNotes: approvalRequest.approvalNotes ?? null,
            approvalReason: approvalRequest.approvalReason ?? null,
            expiresAt: approvalRequest.expiresAt ?? null,
          },
        })
      } catch (error) {
        fastify.log.error('Error creating approval request:', error)
        return reply.internalServerError('Failed to create approval request')
      }
    },
  )

  // Get approval requests (with filtering)
  fastify.get<{
    Querystring: z.infer<typeof GetApprovalRequestsQuerySchema>
    Reply:
      | z.infer<typeof ApprovalRequestsListResponseSchema>
      | z.infer<typeof ApprovalErrorSchema>
  }>(
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
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { status, userId, contentType, triggeredBy, limit, offset } =
          request.query

        // Get approval requests with all filters
        const requests = await fastify.db.getApprovalHistory(
          userId,
          status,
          limit,
          offset,
          contentType,
          triggeredBy,
        )

        // Get the total count with the same filters but without pagination
        const total = await fastify.db.getApprovalHistoryCount(
          userId,
          status,
          contentType,
          triggeredBy,
        )

        return {
          success: true,
          message: 'Approval requests retrieved successfully',
          approvalRequests: requests.map((request) => {
            const expirationInfo = getExpirationInfo(request, fastify.config)
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
        fastify.log.error('Error getting approval requests:', error)
        return reply.internalServerError('Failed to retrieve approval requests')
      }
    },
  )

  // Get specific approval request by ID
  fastify.get<{
    Params: { id: string }
    Reply:
      | z.infer<typeof ApprovalRequestCreateResponseSchema>
      | z.infer<typeof ApprovalErrorSchema>
  }>(
    '/requests/:id',
    {
      schema: {
        summary: 'Get approval request by ID',
        operationId: 'getApprovalRequestById',
        description: 'Retrieve a specific approval request by its ID',
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: ApprovalRequestCreateResponseSchema,
          404: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = Number.parseInt(request.params.id, 10)
        const approvalRequest = await fastify.db.getApprovalRequest(requestId)

        if (!approvalRequest) {
          return reply.notFound('Approval request not found')
        }

        const expirationInfo = getExpirationInfo(
          approvalRequest,
          fastify.config,
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
        fastify.log.error('Error getting approval request:', error)
        return reply.internalServerError('Failed to retrieve approval request')
      }
    },
  )

  // Update approval request (approve/reject/modify)
  fastify.patch<{
    Params: { id: string }
    Body: z.infer<typeof UpdateApprovalRequestSchema>
    Reply:
      | z.infer<typeof ApprovalRequestUpdateResponseSchema>
      | z.infer<typeof ApprovalErrorSchema>
  }>(
    '/requests/:id',
    {
      schema: {
        summary: 'Update approval request',
        operationId: 'updateApprovalRequest',
        description: 'Update an approval request (approve, reject, or modify)',
        params: z.object({
          id: z.string(),
        }),
        body: UpdateApprovalRequestSchema,
        response: {
          200: ApprovalRequestUpdateResponseSchema,
          404: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = Number.parseInt(request.params.id, 10)

        const existingRequest = await fastify.db.getApprovalRequest(requestId)
        if (!existingRequest) {
          reply.status(404)
          return {
            success: false,
            message: 'Approval request not found',
          }
        }

        // Validate state transitions only if status is being changed
        const targetStatus = request.body.status
        const currentStatus = existingRequest.status

        if (targetStatus) {
          // Only validate transitions if status is being updated
          if (currentStatus === 'approved' || currentStatus === 'expired') {
            return reply.conflict(
              `Cannot update ${currentStatus} approval requests`,
            )
          }

          // Allow pending → approved/rejected and rejected → approved
          const validTransitions: Record<string, string[]> = {
            pending: ['approved', 'rejected'],
            rejected: ['approved'],
          }

          if (!validTransitions[currentStatus]?.includes(targetStatus)) {
            return reply.conflict(
              `Invalid state transition from ${currentStatus} to ${targetStatus}`,
            )
          }
        } else {
          // If no status provided, we're just updating other fields (like routing)
          // Still prevent updates to finalized requests
          if (currentStatus === 'approved' || currentStatus === 'expired') {
            return reply.conflict(
              `Cannot modify routing for ${currentStatus} approval requests`,
            )
          }
        }

        const updatedRequest = await fastify.db.updateApprovalRequest(
          requestId,
          {
            status: request.body.status,
            approvedBy: request.body.approvedBy,
            approvalNotes: request.body.approvalNotes,
            proposedRouterDecision: request.body.proposedRouterDecision,
          },
        )

        if (!updatedRequest) {
          throw new Error('Failed to update approval request')
        }

        // If status changed to approved, process the request
        if (targetStatus === 'approved') {
          const result =
            await fastify.approvalService.processApprovedRequest(updatedRequest)
          if (!result.success) {
            fastify.log.warn(
              `Failed to process newly approved request ${requestId}: ${result.error}`,
            )
            // Note: We don't fail the update, just log the warning
          }
        }

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
        fastify.log.error('Error updating approval request:', error)
        return reply.internalServerError('Failed to update approval request')
      }
    },
  )

  // Delete approval request (hard delete from database)
  fastify.delete<{
    Params: { id: string }
    Reply: z.infer<typeof ApprovalErrorSchema>
  }>(
    '/requests/:id',
    {
      schema: {
        summary: 'Delete approval request',
        operationId: 'deleteApprovalRequest',
        description: 'Permanently delete an approval request from database',
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = Number.parseInt(request.params.id, 10)

        // Use the approval service to delete the request (handles SSE events)
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
        fastify.log.error('Error deleting approval request:', error)
        return reply.internalServerError('Failed to delete approval request')
      }
    },
  )

  // Reject approval request (marks as rejected, keeps in database)
  fastify.post<{
    Params: { id: string }
    Body: { reason?: string }
    Reply: z.infer<typeof ApprovalErrorSchema>
  }>(
    '/requests/:id/reject',
    {
      schema: {
        summary: 'Reject approval request',
        operationId: 'rejectApprovalRequest',
        description: 'Reject an approval request (marks as rejected)',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          reason: z.string().optional(),
        }),
        response: {
          200: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = Number.parseInt(request.params.id, 10)
        const { reason } = request.body
        const rejectedBy = request.session.user?.id
        if (!rejectedBy) {
          return reply.unauthorized('User not authenticated')
        }

        // Check if the request exists and is in pending status
        const existingRequest = await fastify.db.getApprovalRequest(requestId)
        if (!existingRequest) {
          return reply.notFound('Approval request not found')
        }

        if (existingRequest.status !== 'pending') {
          return reply.conflict(
            `Cannot reject request that is already ${existingRequest.status}`,
          )
        }

        // Reject the request using the approval service (handles SSE events)
        const rejectedRequest = await fastify.approvalService.rejectRequest(
          requestId,
          rejectedBy,
          reason,
        )

        if (!rejectedRequest) {
          throw new Error('Failed to reject request')
        }

        return {
          success: true,
          message: 'Approval request rejected successfully',
        }
      } catch (error) {
        fastify.log.error('Error rejecting approval request:', error)
        return reply.internalServerError('Failed to reject approval request')
      }
    },
  )

  // Get approval statistics
  fastify.get<{
    Reply:
      | z.infer<typeof ApprovalStatsResponseSchema>
      | z.infer<typeof ApprovalErrorSchema>
  }>(
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
        fastify.log.error('Error getting approval stats:', error)
        return reply.internalServerError(
          'Failed to retrieve approval statistics',
        )
      }
    },
  )

  // Approve request and execute routing
  fastify.post<{
    Params: { id: string }
    Body: { notes?: string }
    Reply: z.infer<typeof ApprovalErrorSchema>
  }>(
    '/requests/:id/approve',
    {
      schema: {
        summary: 'Approve and execute request',
        operationId: 'approveAndExecuteRequest',
        description:
          'Approve an approval request and execute the proposed routing',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          notes: z.string().optional(),
        }),
        response: {
          200: ApprovalErrorSchema,
          404: ApprovalErrorSchema,
          409: ApprovalErrorSchema,
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const requestId = Number.parseInt(request.params.id, 10)
        const { notes } = request.body
        const approvedBy = request.session.user?.id
        if (!approvedBy) {
          return reply.unauthorized('User not authenticated')
        }

        // Check if the request exists and is in pending status
        const existingRequest = await fastify.db.getApprovalRequest(requestId)
        if (!existingRequest) {
          return reply.notFound('Approval request not found')
        }

        if (
          existingRequest.status === 'approved' ||
          existingRequest.status === 'expired'
        ) {
          return reply.conflict(
            `Cannot approve request that is already ${existingRequest.status}`,
          )
        }

        // Approve the request using the approval service (handles SSE events)
        const approvedRequest = await fastify.approvalService.approveRequest(
          requestId,
          approvedBy,
          notes,
        )

        if (!approvedRequest) {
          throw new Error('Failed to approve request')
        }

        // Process the approved request using the approval service
        const result =
          await fastify.approvalService.processApprovedRequest(approvedRequest)

        if (!result.success) {
          return reply.conflict(
            result.error || 'Failed to process approved request',
          )
        }

        return {
          success: true,
          message: 'Approval request approved and executed successfully',
        }
      } catch (error) {
        fastify.log.error('Error approving and executing request:', error)
        return reply.internalServerError(
          'Failed to approve and execute request',
        )
      }
    },
  )

  // Bulk approve requests
  fastify.post<{ Body: BulkApprovalRequest; Reply: BulkOperationResponse }>(
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
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { requestIds, notes } = request.body
        const userId = request.session.user?.id
        if (!userId) {
          return reply.unauthorized('User not authenticated')
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
        fastify.log.error('Error in bulk approve:', error)
        return reply.internalServerError('Failed to bulk approve requests')
      }
    },
  )

  // Bulk reject requests
  fastify.post<{ Body: BulkRejectRequest; Reply: BulkOperationResponse }>(
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
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { requestIds, reason } = request.body
        const userId = request.session.user?.id
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
        fastify.log.error('Error in bulk reject:', error)
        return reply.internalServerError('Failed to bulk reject requests')
      }
    },
  )

  // Bulk delete requests
  fastify.delete<{ Body: BulkDeleteRequest; Reply: BulkOperationResponse }>(
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
        },
        tags: ['Approval'],
      },
    },
    async (request, reply) => {
      try {
        const { requestIds } = request.body

        // Use the approval service batch delete method (handles SSE events)
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
        fastify.log.error('Error in bulk delete:', error)
        return reply.internalServerError('Failed to bulk delete requests')
      }
    },
  )
}

export default plugin
