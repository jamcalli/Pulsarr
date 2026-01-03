import type {
  ApprovalContext,
  ApprovalRequest,
  ApprovalTrigger,
  CreateApprovalRequestData,
  RouterDecision,
} from '@root/types/approval.types.js'
import type { ApprovalMetadata } from '@root/types/progress.types.js'
import type { RadarrItem } from '@root/types/radarr.types.js'
import type { ContentItem } from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import { getGuidMatchScore } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class ApprovalService {
  private notificationQueue: Set<number> = new Set()
  private notificationTimer: NodeJS.Timeout | null = null
  private readonly NOTIFICATION_DEBOUNCE_MS = 3000 // 3 seconds
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'APPROVAL')
  }

  /**
   * Log scheduled job execution with proper service prefix
   */
  logScheduledJob(action: 'start' | 'complete', jobName: string): void {
    this.log.info(
      `${action === 'start' ? 'Running' : 'Completed'} scheduled job: ${jobName}`,
    )
  }

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

      this.log.debug(
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
   * Check if required instances are available for approval processing.
   * Returns health check result indicating if instances are available.
   *
   * @param contentType - 'movie' or 'show' to determine which instance type to check
   * @returns Object with availability status and unavailable instance type if any
   */
  async checkInstanceHealth(
    contentType: 'movie' | 'show',
  ): Promise<{ available: boolean; unavailableType?: 'Radarr' | 'Sonarr' }> {
    if (contentType === 'movie') {
      const health = await this.fastify.radarrManager.checkInstancesHealth()
      if (health.unavailable.length > 0) {
        return { available: false, unavailableType: 'Radarr' }
      }
    } else {
      const health = await this.fastify.sonarrManager.checkInstancesHealth()
      if (health.unavailable.length > 0) {
        return { available: false, unavailableType: 'Sonarr' }
      }
    }
    return { available: true }
  }

  /**
   * Check health for all instance types (used by bulk operations).
   * Returns a list of unavailable instance types.
   *
   * @returns Object with arrays of unavailable instance types
   */
  async checkAllInstancesHealth(): Promise<{
    allAvailable: boolean
    unavailable: ('Radarr' | 'Sonarr')[]
  }> {
    const [sonarrHealth, radarrHealth] = await Promise.all([
      this.fastify.sonarrManager.checkInstancesHealth(),
      this.fastify.radarrManager.checkInstancesHealth(),
    ])

    const unavailable: ('Radarr' | 'Sonarr')[] = []
    if (sonarrHealth.unavailable.length > 0) {
      unavailable.push('Sonarr')
    }
    if (radarrHealth.unavailable.length > 0) {
      unavailable.push('Radarr')
    }

    return {
      allAvailable: unavailable.length === 0,
      unavailable,
    }
  }

  /**
   * Calculates expiration date based on trigger type and configuration
   */
  private calculateExpirationDate(trigger: ApprovalTrigger): Date | null {
    const config = this.fastify.config?.approvalExpiration

    // Return null if expiration is disabled
    if (!config?.enabled) {
      return null
    }

    let expirationHours = config.defaultExpirationHours ?? 72

    // Check for trigger-specific overrides
    switch (trigger) {
      case 'quota_exceeded':
        expirationHours = config.quotaExceededExpirationHours || expirationHours
        break
      case 'router_rule':
        expirationHours = config.routerRuleExpirationHours || expirationHours
        break
      case 'manual_flag':
        expirationHours = config.manualFlagExpirationHours || expirationHours
        break
      case 'content_criteria':
        expirationHours =
          config.contentCriteriaExpirationHours || expirationHours
        break
    }

    const expirationDate = new Date()
    expirationDate.setHours(expirationDate.getHours() + expirationHours)

    this.log.debug(
      `Calculated expiration date for trigger "${trigger}": ${expirationDate.toISOString()} (${expirationHours} hours from now)`,
    )

    return expirationDate
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
    this.log.debug(
      `ApprovalService.createApprovalRequest called with content.title="${content.title}", content.guids=${JSON.stringify(content.guids)}, plexKey="${plexKey}"`,
    )

    // Use Plex key for content_key (user association), fall back to GUID if not provided
    const contentKey = plexKey || content.guids[0] || ''

    // Calculate expiration date based on configuration
    const calculatedExpiresAt =
      expiresAt || this.calculateExpirationDate(trigger)

    const data: CreateApprovalRequestData = {
      userId: user.id,
      contentType: content.type,
      contentTitle: content.title,
      contentKey: contentKey,
      contentGuids: content.guids,
      routerDecision,
      triggeredBy: trigger,
      approvalReason: reason,
      expiresAt: calculatedExpiresAt?.toISOString() || null,
    }

    this.log.debug(
      `Creating approval request with data: userId=${data.userId}, contentTitle="${data.contentTitle}", contentKey="${data.contentKey}"`,
    )

    // Use atomic method that handles expired duplicates within a transaction
    const result =
      await this.fastify.db.createApprovalRequestWithExpiredHandling(data)

    // Only emit events and send notifications for newly created requests
    if (result.isNewlyCreated) {
      // Emit SSE event for new approval request
      this.emitApprovalEvent('created', result.request, user.name)

      // Queue Discord notification to primary admin if Discord bot is available
      this.queueDiscordApprovalNotification(result.request)

      this.log.info(
        `New approval request created for "${result.request.contentTitle}" by user ${user.id}`,
      )
    } else {
      this.log.debug(
        `Found existing pending approval request for "${result.request.contentTitle}" by user ${user.id}, skipping notifications`,
      )
    }

    return result.request
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

      // Filter for matching content and different users using weighting system
      const potentialMatches = relatedRequests
        .map((req) => ({
          req,
          score: getGuidMatchScore(req.contentGuids, contentGuids),
        }))
        .filter(
          (match) => match.score > 0 && match.req.userId !== excludeUserId,
        )
        .sort((a, b) => b.score - a.score)

      const matchingRequests = potentialMatches.map((match) => match.req)

      if (matchingRequests.length > 0) {
        this.log.info(
          `Found ${matchingRequests.length} pending requests for same content, auto-approving them`,
        )

        // Auto-approve all matching requests
        for (const matchingRequest of matchingRequests) {
          await this.fastify.db.updateApprovalRequest(matchingRequest.id, {
            status: 'approved',
            approvedBy: approvedBy,
            approvalNotes: `Auto-approved: Content already added to system by another user's request`,
          })

          // Send native webhook notification for cross-user fulfillment (fire-and-forget)
          void this.fastify.notifications.sendApprovalResolved(
            matchingRequest,
            'approved',
            approvedBy,
            'Content already added to system by another user request',
          )

          this.log.info(
            `Auto-approved request ${matchingRequest.id} for user ${matchingRequest.userId}: ${matchingRequest.contentTitle} (content already available)`,
          )
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Error handling cross-user content fulfillment')
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

        this.log.info(
          `Processing approval routing to ${allInstanceIds.length} instances: ${allInstanceIds.join(', ')} (primary: ${instanceId}, synced: ${syncedInstances?.join(', ') || 'none'})`,
        )

        const routingResults: {
          succeeded: number[]
          failed: Array<{ instanceId: number; error: unknown }>
        } = { succeeded: [], failed: [] }

        if (instanceType === 'radarr') {
          // Route to all Radarr instances (primary + synced)
          for (const targetInstanceId of allInstanceIds) {
            const isPrimary = targetInstanceId === instanceId

            try {
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
                isPrimary ? proposedRouting.monitor : undefined,
              )
              routingResults.succeeded.push(targetInstanceId)
            } catch (error) {
              this.log.error(
                { error, instanceId: targetInstanceId },
                'Failed to route to Radarr instance',
              )
              routingResults.failed.push({
                instanceId: targetInstanceId,
                error,
              })
              if (isPrimary) {
                // Primary instance failure should fail the entire operation
                throw error
              }
            }
          }
        } else if (instanceType === 'sonarr') {
          // Route to all Sonarr instances (primary + synced)
          for (const targetInstanceId of allInstanceIds) {
            const isPrimary = targetInstanceId === instanceId

            try {
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
              routingResults.succeeded.push(targetInstanceId)
            } catch (error) {
              this.log.error(
                { error, instanceId: targetInstanceId },
                'Failed to route to Sonarr instance',
              )
              routingResults.failed.push({
                instanceId: targetInstanceId,
                error,
              })
              if (isPrimary) {
                // Primary instance failure should fail the entire operation
                throw error
              }
            }
          }
        } else {
          return { success: false, error: 'Unknown instance type' }
        }

        if (routingResults.failed.length > 0) {
          this.log.warn(
            `Partial routing failure: ${routingResults.failed.length} of ${allInstanceIds.length} instances failed`,
          )
        }

        // Check if quota should be bypassed (router rule bypass or user bypass setting)
        const quotasBypassedByRule =
          routerDecision.approval?.data?.quotasBypassedByRule === true
        const userQuota = await this.fastify.db.getUserQuota(
          request.userId,
          request.contentType,
        )
        const userBypassEnabled = userQuota?.bypassApproval === true

        // Record quota usage after successful routing (unless bypassed)
        if (quotasBypassedByRule || userBypassEnabled) {
          const bypassReason = quotasBypassedByRule
            ? 'router rule bypass'
            : 'user bypass setting'
          this.log.debug(
            `Skipping quota recording for request ${request.id} due to ${bypassReason}`,
          )
        } else {
          await this.fastify.quotaService.recordUsage(
            request.userId,
            request.contentType,
          )
        }

        this.log.info(
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
      this.log.error(
        { error, requestId: request.id },
        'Failed to process approved request',
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
      const config = this.fastify.config?.approvalExpiration

      // Only run maintenance if approval expiration is enabled
      if (!config?.enabled) {
        this.log.debug('Approval expiration disabled, skipping maintenance')
        return
      }

      // Handle expiration action (auto-approve or just expire)
      if (config.expirationAction === 'auto_approve') {
        // Check instance health before auto-approving - skip cycle if any instances are down
        const healthCheck = await this.checkAllInstancesHealth()
        if (!healthCheck.allAvailable) {
          this.log.warn(
            { unavailable: healthCheck.unavailable },
            'Skipping auto-approve maintenance: some instances are unavailable',
          )
          // Still proceed with other maintenance (expiration, cleanup) below
        } else {
          // Get expired pending requests atomically from database
          const expiredRequests =
            await this.fastify.db.getExpiredPendingRequests()

          if (expiredRequests.length > 0) {
            this.log.info(
              `Auto-approving ${expiredRequests.length} expired approval requests`,
            )

            // Auto-approve each expired request
            for (const request of expiredRequests) {
              try {
                // Approve the request with system user (ID 0)
                const approvedRequest = await this.fastify.db.approveRequest(
                  request.id,
                  0, // System user
                  'Auto-approved: Request expired with auto-approval enabled',
                )

                if (approvedRequest) {
                  // Emit SSE event for approved request
                  this.emitApprovalEvent(
                    'approved',
                    approvedRequest,
                    approvedRequest.userName,
                  )

                  // Send native webhook notification for expiration-based approval (fire-and-forget)
                  void this.fastify.notifications.sendApprovalResolved(
                    approvedRequest,
                    'approved',
                    0, // System user
                    'Request expired with auto-approval enabled',
                  )

                  // Process the approved request (route to Radarr/Sonarr)
                  const processResult =
                    await this.processApprovedRequest(approvedRequest)
                  if (processResult.success) {
                    this.log.info(
                      `Successfully auto-approved and processed expired request ${request.id} for user ${request.userId}: ${request.contentTitle}`,
                    )
                  } else {
                    this.log.warn(
                      `Auto-approved expired request ${request.id} but failed to process: ${processResult.error}`,
                    )
                  }
                }
              } catch (error) {
                this.log.error(
                  { error },
                  `Failed to auto-approve expired request ${request.id}`,
                )
              }
            }
          }
        }
      }

      // Expire requests that have passed their expiration date (this will now handle remaining pending requests)
      const expiredCount = await this.fastify.db.expireOldRequests()
      if (expiredCount > 0) {
        const action =
          config.expirationAction === 'auto_approve'
            ? 'processed/expired'
            : 'expired'
        this.log.info(`${action} ${expiredCount} old approval requests`)
      }

      // Cleanup old expired requests based on configuration
      const cleanupDays = config.cleanupExpiredDays || 30
      const cleanedCount =
        await this.fastify.db.cleanupExpiredRequests(cleanupDays)
      if (cleanedCount > 0) {
        this.log.info(
          `Cleaned up ${cleanedCount} expired approval requests (retention: ${cleanupDays} days)`,
        )
      }
    } catch (error) {
      this.log.error({ error }, 'Failed to perform approval maintenance:')
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

        // Send native webhook notification (fire-and-forget)
        void this.fastify.notifications.sendApprovalResolved(
          result,
          'approved',
          approvedBy,
          notes,
        )
      }

      return result
    } catch (error) {
      this.log.error({ error }, `Error approving request ${requestId}:`)
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

        // Send native webhook notification (fire-and-forget)
        void this.fastify.notifications.sendApprovalResolved(
          result,
          'denied',
          rejectedBy,
          reason,
        )
      }

      return result
    } catch (error) {
      this.log.error({ error }, `Error rejecting request ${requestId}:`)
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
            this.log.warn(
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
      this.log.error({ error, requestId }, 'Error deleting approval request')
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

  /**
   * Queue Discord notification with debouncing to batch multiple requests
   */
  private queueDiscordApprovalNotification(request: ApprovalRequest): void {
    // Add request to the queue
    this.notificationQueue.add(request.id)

    this.log.debug(
      { approvalId: request.id, queueSize: this.notificationQueue.size },
      'Queued approval notification',
    )

    // Clear existing timer if one exists
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer)
    }

    // Set new timer to send batched notification
    this.notificationTimer = setTimeout(async () => {
      await this.sendBatchedApprovalNotifications()
      this.notificationQueue.clear()
      this.notificationTimer = null
    }, this.NOTIFICATION_DEBOUNCE_MS)
  }

  /**
   * Send batched approval notifications via NotificationService.
   * Delegates channel routing and delivery to the orchestration layer.
   */
  private async sendBatchedApprovalNotifications(): Promise<void> {
    if (this.notificationQueue.size === 0) {
      return
    }

    // Get all pending approvals and the queued requests
    const pendingApprovals = await this.fastify.db.getPendingApprovalRequests()
    const totalPending = pendingApprovals.length
    const queuedRequestIds = Array.from(this.notificationQueue)

    // Find the queued requests in the pending approvals and map to orchestration format
    const queuedRequests = pendingApprovals
      .filter((approval) => queuedRequestIds.includes(approval.id))
      .map((approval) => ({
        id: approval.id,
        contentTitle: approval.contentTitle,
        contentType: approval.contentType,
        contentKey: approval.contentKey,
        contentGuids: approval.contentGuids,
        userId: approval.userId,
        userName: approval.userName,
        triggeredBy: approval.triggeredBy,
        approvalReason: approval.approvalReason ?? null,
      }))

    if (queuedRequests.length === 0) {
      this.log.debug('No queued requests found in pending approvals')
      return
    }

    // Delegate notification delivery to NotificationService
    const successCount = await this.fastify.notifications.sendApprovalBatch(
      queuedRequests,
      totalPending,
    )

    this.log.debug(
      { queuedCount: queuedRequests.length, successCount },
      'Approval batch notification complete',
    )
  }

  /**
   * Force send any pending batched notifications (useful for shutdown)
   */
  async flushPendingNotifications(): Promise<void> {
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer)
      this.notificationTimer = null
    }

    if (this.notificationQueue.size > 0) {
      await this.sendBatchedApprovalNotifications()
      this.notificationQueue.clear()
    }
  }
}
