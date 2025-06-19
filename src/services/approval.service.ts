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

export class ApprovalService {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Determines if content requires approval based on user quotas and router decisions
   */
  async requiresApproval(context: ApprovalContext): Promise<{
    required: boolean
    reason?: string
    trigger?: ApprovalTrigger
  }> {
    const userId = context.user.id

    // Check if user bypasses approval
    const quota = await this.fastify.db.getUserQuota(userId)
    if (quota?.bypassApproval) {
      return { required: false }
    }

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
  ): Promise<ApprovalRequest> {
    const contentKey = content.guids[0] || '' // Use first GUID as key

    // Check if approval request already exists for this user and content
    const existingRequest = await this.fastify.db.getApprovalRequestByContent(
      user.id,
      contentKey,
    )

    if (existingRequest && existingRequest.status === 'pending') {
      this.fastify.log.debug(
        `Approval request already exists for user ${user.id} and content ${contentKey}`,
      )
      return existingRequest
    }

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

    return this.fastify.db.createApprovalRequest(data)
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
        // Actually execute the routing to Radarr/Sonarr

        const { instanceType, instanceId } = proposedRouting

        if (instanceType === 'radarr') {
          // Route to Radarr
          await this.fastify.radarrManager.routeItemToRadarr(
            {
              title: request.contentTitle,
              type: 'movie',
              guids: request.contentGuids,
            } as RadarrItem,
            request.contentKey,
            request.userId,
            instanceId,
            false, // Not a sync operation
            proposedRouting.rootFolder || undefined,
            proposedRouting.qualityProfile,
            proposedRouting.tags || [],
            proposedRouting.searchOnAdd,
            proposedRouting.minimumAvailability,
          )
        } else if (instanceType === 'sonarr') {
          // Route to Sonarr
          await this.fastify.sonarrManager.routeItemToSonarr(
            {
              title: request.contentTitle,
              type: 'show',
              guids: request.contentGuids,
            } as SonarrItem,
            request.contentKey,
            request.userId,
            instanceId,
            false, // Not a sync operation
            proposedRouting.rootFolder || undefined,
            proposedRouting.qualityProfile,
            proposedRouting.tags || [],
            proposedRouting.searchOnAdd,
            proposedRouting.seasonMonitoring,
            proposedRouting.seriesType,
          )
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
