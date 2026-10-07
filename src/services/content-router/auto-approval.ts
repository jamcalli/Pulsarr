import type { RouterDecision } from '@root/types/approval.types.js'
import type {
  ContentItem,
  RoutingContext,
  RoutingDetails,
} from '@root/types/router.types.js'
import type { ContentRouterDeps } from './types.js'

export interface AutoApprovalParams {
  item: ContentItem
  context: RoutingContext
  applied: RoutingDetails
  additionalApplied: RoutingDetails[]
  syncedInstances: number[] | undefined
}

function toApprovalRouting(
  applied: RoutingDetails,
): NonNullable<RouterDecision['routing']> {
  return {
    instanceId: applied.instanceId,
    instanceType: applied.instanceType,
    qualityProfile: applied.qualityProfile,
    rootFolder: applied.rootFolder,
    tags: applied.tags,
    priority: 50,
    searchOnAdd: applied.searchOnAdd,
    seasonMonitoring: applied.seasonMonitoring,
    seriesType: applied.seriesType,
    minimumAvailability: applied.minimumAvailability ?? undefined,
    monitor: applied.monitor,
    ruleId: applied.ruleId,
  }
}

/** Never throws, because an audit row must not undo a completed add. */
export async function createAutoApprovalRecord(
  params: AutoApprovalParams,
  deps: Pick<ContentRouterDeps, 'logger' | 'db' | 'progress' | 'notifications'>,
): Promise<void> {
  const { item, context, applied, additionalApplied, syncedInstances } = params
  const { logger } = deps
  try {
    if (context.syncing) {
      logger.debug(
        `Skipping auto-approval record for sync operation: ${item.title}`,
      )
      return
    }

    const lookupUserId = context.userId ?? 0
    const contentKey =
      context.itemKey ||
      item.guids[0] ||
      `${context.contentType}:${(item.title || 'unknown').slice(0, 128)}`
    const existingRequest = await deps.db.getApprovalRequestByContent(
      lookupUserId,
      contentKey,
    )
    if (existingRequest) {
      logger.debug(
        `Auto-approval record already exists for ${item.title}, skipping`,
      )
      return
    }

    const userId = context.userId || 0

    const proposedRouting = {
      ...toApprovalRouting(applied),
      syncedInstances:
        syncedInstances && syncedInstances.length > 0
          ? syncedInstances
          : undefined,
    }
    const additionalRouting =
      additionalApplied.length > 0
        ? additionalApplied.map(toApprovalRouting)
        : undefined

    const approvalRequest = await deps.db.createApprovalRequest({
      userId,
      contentType: context.contentType as 'movie' | 'show',
      contentTitle: item.title,
      contentKey,
      contentGuids: item.guids,
      routerDecision: {
        action: 'require_approval',
        approval: {
          data: {},
          reason: 'Auto-added (no approval required)',
          triggeredBy: 'content_criteria',
          proposedRouting,
          additionalRouting,
        },
      },
      triggeredBy: 'content_criteria',
      approvalReason: 'Auto-added (no approval required)',
      routerRuleId: applied.ruleId,
    })

    const updatedRequest = await deps.db.updateApprovalRequest(
      approvalRequest.id,
      {
        status: 'auto_approved',
        approvedBy: undefined,
        approvalNotes: 'Auto-approved (no approval required)',
      },
    )

    logger.info(
      `Created auto-approval tracking record for "${item.title}" (request ID: ${approvalRequest.id})`,
    )

    if (deps.progress?.hasActiveConnections() && updatedRequest) {
      const finalUserName =
        updatedRequest.userName || (userId === 0 ? 'System' : `User ${userId}`)

      const metadata = {
        action: 'created' as const,
        requestId: updatedRequest.id,
        userId: updatedRequest.userId,
        userName: finalUserName,
        contentTitle: updatedRequest.contentTitle,
        contentType: updatedRequest.contentType,
        status: updatedRequest.status,
      }

      deps.progress.emit({
        operationId: `approval-${updatedRequest.id}`,
        type: 'approval',
        phase: 'created',
        progress: 100,
        message: `Auto-approved "${updatedRequest.contentTitle}" for ${finalUserName}`,
        metadata,
      })
    }

    if (updatedRequest) {
      void deps.notifications.sendApprovalAuto(
        updatedRequest,
        {
          instanceType: proposedRouting.instanceType,
          instanceId: proposedRouting.instanceId,
          qualityProfile: proposedRouting.qualityProfile ?? null,
          rootFolder: proposedRouting.rootFolder ?? null,
          tags: proposedRouting.tags ?? [],
          searchOnAdd: proposedRouting.searchOnAdd ?? null,
          minimumAvailability: proposedRouting.minimumAvailability ?? null,
          monitor: proposedRouting.monitor ?? null,
          seasonMonitoring: proposedRouting.seasonMonitoring ?? null,
          seriesType: proposedRouting.seriesType ?? null,
          syncedInstances: proposedRouting.syncedInstances,
        },
        'Auto-approved (no approval required)',
      )
    }
  } catch (error) {
    logger.error(
      { error },
      `Failed to create auto-approval record for "${item.title}"`,
    )
  }
}
