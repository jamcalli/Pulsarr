import type { FastifyInstance } from 'fastify'
import type {
  ApprovalRequest,
  CreateApprovalRequestData,
  ApprovalContext,
  RouterDecision,
  ApprovalTrigger,
} from '@root/types/approval.types.js'
import type { ContentItem } from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { ApprovalMetadata } from '@root/types/progress.types.js'
import { extractTypedGuid } from '@utils/guid-handler.js'

export class ApprovalService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Emits SSE event for approval actions
   */
  private emitApprovalEvent(
    action: ApprovalMetadata['action'],
    request: ApprovalRequest,
    userName: string,
  ): void {
    if (this.fastify.progress?.hasActiveConnections()) {
      // Always prefer the userName from the database request object if available
      const finalUserName =
        request.userName || userName || `User ${request.userId}`

      this.fastify.log.debug(
        `Emitting approval SSE event: action=${action}, requestId=${request.id}, userName="${userName}", request.userName="${request.userName}", finalUserName="${finalUserName}"`,
      )

      const metadata: ApprovalMetadata = {
        action,
        requestId: request.id,
        userId: request.userId,
        userName: finalUserName,
        contentTitle: request.contentTitle,
        contentType: request.contentType,
        status: request.status,
      }

      this.fastify.progress.emit({
        operationId: `approval-${request.id}`,
        type: 'approval',
        phase: action,
        progress: 100, // Approval events are instant
        message: `${action} approval request for "${request.contentTitle}" by ${finalUserName}`,
        metadata,
      })
    }
  }

  /**
   * Determines if content requires approval based on user quotas and router decisions
   */
  async requiresApproval(context: ApprovalContext): Promise<{
    required: boolean
    reason?: string
    trigger?: ApprovalTrigger
  }> {
    // Note: User bypass is now handled via auto-approval rather than skipping approval entirely

    // Check if quota is exceeded
    if (context.quotaStatus?.exceeded) {
      return {
        required: true,
        reason: `${context.quotaStatus.quotaType} quota exceeded (${context.quotaStatus.currentUsage}/${context.quotaStatus.quotaLimit})`,
        trigger: 'quota_exceeded',
      }
    }

    // Check router decision for approval requirement
    if (context.routerDecision.action === 'require_approval') {
      return {
        required: true,
        reason:
          context.routerDecision.approval?.reason || 'Required by router rule',
        trigger: context.routerDecision.approval?.triggeredBy || 'router_rule',
      }
    }

    return { required: false }
  }

  /**
   * Creates an approval request when content needs approval
   */
  async createApprovalRequest(
    user: { id: number; name: string },
    content: ContentItem,
    routerDecision: RouterDecision,
    trigger: ApprovalTrigger,
    reason?: string,
    expiresAt?: Date,
    plexKey?: string,
  ): Promise<ApprovalRequest> {
    this.fastify.log.debug(
      `ApprovalService.createApprovalRequest called with content.title="${content.title}", content.guids=${JSON.stringify(content.guids)}, plexKey="${plexKey}"`,
    )

    // Use Plex key for content_key (user association), fall back to GUID if not provided
    const contentKey = plexKey || content.guids[0] || ''

    const data: CreateApprovalRequestData = {
      userId: user.id,
      contentType: content.type,
      contentTitle: content.title,
      contentKey: contentKey,
      contentGuids: content.guids,
      routerDecision,
      triggeredBy: trigger,
      approvalReason: reason,
      expiresAt: expiresAt?.toISOString() || null,
    }

    this.fastify.log.debug(
      `Creating approval request with data: userId=${data.userId}, contentTitle="${data.contentTitle}", contentKey="${data.contentKey}"`,
    )

    // Use atomic method that handles expired duplicates within a transaction
    const createdRequest =
      await this.fastify.db.createApprovalRequestWithExpiredHandling(data)

    // Emit SSE event for new approval request
    this.emitApprovalEvent('created', createdRequest, user.name)

    return createdRequest
  }

  /**
   * Checks for pending requests for the same content and auto-approves them
   */
  async handleCrossUserContentFulfillment(
    contentGuids: string[],
    contentType: 'movie' | 'show',
    excludeUserId: number,
    approvedBy: number,
  ): Promise<void> {
    try {
      // Find all pending requests for the same content from other users
      const relatedRequests = await this.fastify.db.getApprovalHistory(
        undefined, // userId - get all users
        'pending', // status
        undefined, // limit
        undefined, // offset
        contentType,
      )

      // Filter for matching content and different users
      const matchingRequests = relatedRequests.filter(
        (req) =>
          req.userId !== excludeUserId &&
          req.contentGuids.some((guid) => contentGuids.includes(guid)),
      )

      if (matchingRequests.length > 0) {
        this.fastify.log.info(
          `Found ${matchingRequests.length} pending requests for same content, auto-approving them`,
        )

        // Auto-approve all matching requests
        for (const matchingRequest of matchingRequests) {
          await this.fastify.db.updateApprovalRequest(matchingRequest.id, {
            status: 'approved',
            approvedBy: approvedBy,
            approvalNotes: `Auto-approved: Content already added to system by another user's request`,
          })

          this.fastify.log.info(
            `Auto-approved request ${matchingRequest.id} for user ${matchingRequest.userId}: ${matchingRequest.contentTitle} (content already available)`,
          )
        }
      }
    } catch (error) {
      this.fastify.log.error(
        'Error handling cross-user content fulfillment:',
        error,
      )
      // Don't throw - this is a nice-to-have feature
    }
  }

  /**
   * Processes an approved request by executing the stored router decision
   */
  async processApprovedRequest(
    request: ApprovalRequest,
  ): Promise<{ success: boolean; error?: string }> {
    if (request.status !== 'approved') {
      return { success: false, error: 'Request is not approved' }
    }

    try {
      const routerDecision = request.proposedRouterDecision

      // Handle both action types: 'route' and 'require_approval'
      let proposedRouting = null

      if (routerDecision.action === 'route' && routerDecision.routing) {
        proposedRouting = routerDecision.routing
      } else if (
        routerDecision.action === 'require_approval' &&
        routerDecision.approval?.proposedRouting
      ) {
        proposedRouting = routerDecision.approval.proposedRouting
      }

      if (proposedRouting) {
        // Route the content using the stored decision
        // Execute routing to both primary and synced instances

        const { instanceType, instanceId, syncedInstances } = proposedRouting
        const allInstanceIds = [instanceId, ...(syncedInstances || [])]

        this.fastify.log.info(
          `Processing approval routing to ${allInstanceIds.length} instances: ${allInstanceIds.join(', ')} (primary: ${instanceId}, synced: ${syncedInstances?.join(', ') || 'none'})`,
        )

        if (instanceType === 'radarr') {
          // Route to all Radarr instances (primary + synced)
          for (const targetInstanceId of allInstanceIds) {
            const isPrimary = targetInstanceId === instanceId

            // Use stored settings for primary instance, undefined for synced instances (to use their defaults)
            await this.fastify.radarrManager.routeItemToRadarr(
              {
                title: request.contentTitle,
                type: 'movie',
                guids: request.contentGuids,
              } as RadarrItem,
              request.contentKey,
              request.userId,
              targetInstanceId,
              !isPrimary, // Mark as sync operation if not primary
              isPrimary ? proposedRouting.rootFolder || undefined : undefined,
              isPrimary ? proposedRouting.qualityProfile : undefined,
              isPrimary ? proposedRouting.tags || [] : undefined,
              isPrimary ? proposedRouting.searchOnAdd : undefined,
              isPrimary ? proposedRouting.minimumAvailability : undefined,
            )
          }
        } else if (instanceType === 'sonarr') {
          // Route to all Sonarr instances (primary + synced)
          for (const targetInstanceId of allInstanceIds) {
            const isPrimary = targetInstanceId === instanceId

            // Use stored settings for primary instance, undefined for synced instances (to use their defaults)
            await this.fastify.sonarrManager.routeItemToSonarr(
              {
                title: request.contentTitle,
                type: 'show',
                guids: request.contentGuids,
              } as SonarrItem,
              request.contentKey,
              request.userId,
              targetInstanceId,
              !isPrimary, // Mark as sync operation if not primary
              isPrimary ? proposedRouting.rootFolder || undefined : undefined,
              isPrimary ? proposedRouting.qualityProfile : undefined,
              isPrimary ? proposedRouting.tags || [] : undefined,
              isPrimary ? proposedRouting.searchOnAdd : undefined,
              isPrimary ? proposedRouting.seasonMonitoring : undefined,
              isPrimary ? proposedRouting.seriesType : undefined,
            )
          }
        } else {
          return { success: false, error: 'Unknown instance type' }
        }

        // Record quota usage after successful routing
        await this.fastify.db.recordQuotaUsage(
          request.userId,
          request.contentType,
          new Date(),
        )

        this.fastify.log.info(
          `Successfully routed approved request ${request.id} for user ${request.userId}: ${request.contentTitle} to ${instanceType} instance ${instanceId}`,
        )

        // Handle cross-user content fulfillment
        await this.handleCrossUserContentFulfillment(
          request.contentGuids,
          request.contentType,
          request.userId,
          request.approvedBy || 0, // Use the same approver or system user
        )

        return { success: true }
      }

      return { success: false, error: 'Invalid routing decision' }
    } catch (error) {
      this.fastify.log.error(
        `Failed to process approved request ${request.id}:`,
        error,
      )
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Performs maintenance tasks like expiring old requests
   */
  async performMaintenance(): Promise<void> {
    try {
      const expiredCount = await this.fastify.db.expireOldRequests()
      if (expiredCount > 0) {
        this.fastify.log.info(`Expired ${expiredCount} old approval requests`)
      }

      const cleanedCount = await this.fastify.db.cleanupExpiredRequests(30)
      if (cleanedCount > 0) {
        this.fastify.log.info(
          `Cleaned up ${cleanedCount} expired approval requests`,
        )
      }
    } catch (error) {
      this.fastify.log.error('Failed to perform approval maintenance:', error)
    }
  }

  /**
   * Gets approval context for a user and content item
   */
  async getApprovalContext(
    user: { id: number; name: string },
    content: ContentItem,
    routerDecision: RouterDecision,
  ): Promise<ApprovalContext> {
    const quotaStatus = await this.fastify.db.getQuotaStatus(
      user.id,
      content.type,
    )

    return {
      user,
      content,
      routerDecision,
      quotaStatus: quotaStatus || undefined,
      triggerReason: 'Content evaluation for approval workflow',
    }
  }

  /**
   * Checks if a duplicate approval request already exists
   */
  async isDuplicateRequest(
    userId: number,
    contentKey: string,
  ): Promise<boolean> {
    const existing = await this.fastify.db.getApprovalRequestByContent(
      userId,
      contentKey,
    )
    return existing !== null && existing.status === 'pending'
  }

  /**
   * Approves a single request
   */
  async approveRequest(
    requestId: number,
    approvedBy: number,
    notes?: string,
  ): Promise<ApprovalRequest | null> {
    try {
      const result = await this.fastify.db.approveRequest(
        requestId,
        approvedBy,
        notes,
      )

      if (result) {
        // Emit SSE event for approved request
        this.emitApprovalEvent('approved', result, result.userName)
      }

      return result
    } catch (error) {
      this.fastify.log.error(`Error approving request ${requestId}:`, error)
      return null
    }
  }

  /**
   * Rejects a single request
   */
  async rejectRequest(
    requestId: number,
    rejectedBy: number,
    reason?: string,
  ): Promise<ApprovalRequest | null> {
    try {
      const result = await this.fastify.db.rejectRequest(
        requestId,
        rejectedBy,
        reason,
      )

      if (result) {
        // Emit SSE event for rejected request
        this.emitApprovalEvent('rejected', result, result.userName)
      }

      return result
    } catch (error) {
      this.fastify.log.error(`Error rejecting request ${requestId}:`, error)
      return null
    }
  }

  /**
   * Approves multiple requests in batch
   */
  async batchApprove(
    requestIds: number[],
    approvedBy: number,
    notes?: string,
  ): Promise<{ approved: number; failed: number[]; errors: string[] }> {
    const results = {
      approved: 0,
      failed: [] as number[],
      errors: [] as string[],
    }

    for (const id of requestIds) {
      try {
        const result = await this.fastify.db.approveRequest(
          id,
          approvedBy,
          notes,
        )
        if (result) {
          results.approved++

          // Emit SSE event for approved request
          this.emitApprovalEvent('approved', result, result.userName)

          // Process the approved request
          const processResult = await this.processApprovedRequest(result)
          if (!processResult.success) {
            this.fastify.log.warn(
              `Approved request ${id} but failed to process: ${processResult.error}`,
            )
          }
        } else {
          results.failed.push(id)
          results.errors.push(`Request ${id} not found`)
        }
      } catch (error) {
        results.failed.push(id)
        results.errors.push(
          `Request ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return results
  }

  /**
   * Rejects multiple requests in batch
   */
  async batchReject(
    requestIds: number[],
    rejectedBy: number,
    reason?: string,
  ): Promise<{ rejected: number; failed: number[]; errors: string[] }> {
    const results = {
      rejected: 0,
      failed: [] as number[],
      errors: [] as string[],
    }

    for (const id of requestIds) {
      try {
        const result = await this.fastify.db.rejectRequest(
          id,
          rejectedBy,
          reason,
        )
        if (result) {
          results.rejected++

          // Emit SSE event for rejected request
          this.emitApprovalEvent('rejected', result, result.userName)
        } else {
          results.failed.push(id)
          results.errors.push(`Request ${id} not found`)
        }
      } catch (error) {
        results.failed.push(id)
        results.errors.push(
          `Request ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return results
  }

  /**
   * Deletes a single approval request
   */
  async deleteApprovalRequest(requestId: number): Promise<boolean> {
    try {
      // Get the request before deletion for SSE event
      const requestToDelete =
        await this.fastify.db.getApprovalRequest(requestId)

      const deleted = await this.fastify.db.deleteApprovalRequest(requestId)

      if (deleted && requestToDelete) {
        // Emit SSE event for deleted request
        this.emitApprovalEvent(
          'deleted',
          requestToDelete,
          requestToDelete.userName,
        )
      }

      return deleted
    } catch (error) {
      this.fastify.log.error(
        `Error deleting approval request ${requestId}:`,
        error,
      )
      return false
    }
  }

  /**
   * Deletes multiple requests in batch
   */
  async batchDelete(
    requestIds: number[],
  ): Promise<{ deleted: number; failed: number[]; errors: string[] }> {
    const results = {
      deleted: 0,
      failed: [] as number[],
      errors: [] as string[],
    }

    for (const id of requestIds) {
      try {
        const success = await this.deleteApprovalRequest(id)
        if (success) {
          results.deleted++
        } else {
          results.failed.push(id)
          results.errors.push(`Request ${id} not found`)
        }
      } catch (error) {
        results.failed.push(id)
        results.errors.push(
          `Request ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return results
  }
}
