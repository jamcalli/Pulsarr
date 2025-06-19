import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { ApprovalRequest } from '@root/types/approval.types.js'
import {
  CreateApprovalRequestSchema,
  UpdateApprovalRequestSchema,
  ApprovalRequestCreateResponseSchema,
  ApprovalRequestUpdateResponseSchema,
  ApprovalRequestsListResponseSchema,
  ApprovalStatsResponseSchema,
  GetApprovalRequestsQuerySchema,
  ApprovalErrorSchema,
} from '@schemas/approval/approval.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
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
          reply.status(409)
          return {
            success: false,
            message: 'Approval request already exists for this content',
          }
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

        reply.status(201)
        return {
          success: true,
          message: 'Approval request created successfully',
          approvalRequest,
        }
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

        // For now, return requests length as total (would need separate count query for accurate total)
        const total = requests.length

        return {
          success: true,
          message: 'Approval requests retrieved successfully',
          approvalRequests: requests,
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
          reply.status(404)
          return {
            success: false,
            message: 'Approval request not found',
          }
        }

        return {
          success: true,
          message: 'Approval request retrieved successfully',
          approvalRequest,
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

        // Validate state transitions
        const targetStatus = request.body.status
        const currentStatus = existingRequest.status

        if (currentStatus === 'approved' || currentStatus === 'expired') {
          reply.status(409)
          return {
            success: false,
            message: `Cannot update ${currentStatus} approval requests`,
          }
        }

        // Allow pending → approved/rejected and rejected → approved
        const validTransitions = {
          pending: ['approved', 'rejected'],
          rejected: ['approved'],
        }

        if (!validTransitions[currentStatus]?.includes(targetStatus)) {
          reply.status(409)
          return {
            success: false,
            message: `Invalid state transition from ${currentStatus} to ${targetStatus}`,
          }
        }

        const updatedRequest = await fastify.db.updateApprovalRequest(
          requestId,
          {
            status: request.body.status,
            approvedBy: request.body.approvedBy,
            approvalNotes: request.body.approvalNotes,
          },
        )

        if (!updatedRequest) {
          throw new Error('Failed to update approval request')
        }

        // If status changed to approved, process the request
        if (targetStatus === 'approved' && currentStatus !== 'approved') {
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
          approvalRequest: updatedRequest,
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

        // Actually delete the approval request from the database
        const deleted = await fastify.db.deleteApprovalRequest(requestId)

        if (!deleted) {
          reply.status(404)
          return {
            success: false,
            message: 'Approval request not found',
          }
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
    Body: { rejectedBy: number; reason?: string }
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
          rejectedBy: z.number(),
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
        const { rejectedBy, reason } = request.body

        // Check if the request exists and is in pending status
        const existingRequest = await fastify.db.getApprovalRequest(requestId)
        if (!existingRequest) {
          reply.status(404)
          return {
            success: false,
            message: 'Approval request not found',
          }
        }

        if (existingRequest.status !== 'pending') {
          reply.status(409)
          return {
            success: false,
            message: `Cannot reject request that is already ${existingRequest.status}`,
          }
        }

        // Reject the request using the database method
        const rejectedRequest = await fastify.db.rejectRequest(
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
    Body: { approvedBy: number; notes?: string }
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
          approvedBy: z.number(),
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
        const { approvedBy, notes } = request.body

        // Check if the request exists and is in pending status
        const existingRequest = await fastify.db.getApprovalRequest(requestId)
        if (!existingRequest) {
          reply.status(404)
          return {
            success: false,
            message: 'Approval request not found',
          }
        }

        if (
          existingRequest.status === 'approved' ||
          existingRequest.status === 'expired'
        ) {
          reply.status(409)
          return {
            success: false,
            message: `Cannot approve request that is already ${existingRequest.status}`,
          }
        }

        // Approve the request using the database method
        const approvedRequest = await fastify.db.approveRequest(
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
          reply.status(409)
          return {
            success: false,
            message: result.error || 'Failed to process approved request',
          }
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
}

export default plugin
