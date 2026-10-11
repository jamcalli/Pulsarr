import type {
  ApprovalData,
  ApprovalTrigger,
  RouterDecision,
} from '@root/types/approval.types.js'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import { routeUsingApprovedDecision } from './approved-routing.js'
import {
  type ContentRouterDeps,
  notRouted,
  type RoutingOutcome,
} from './types.js'

export interface ApprovalRequirement {
  required: boolean
  reason?: string
  trigger?: ApprovalTrigger
  data?: ApprovalData
}

/** Null means no request decides the item and routing continues, otherwise the outcome stands as the result. */
export async function checkExistingApprovalRequest(
  item: ContentItem,
  context: RoutingContext,
  deps: Pick<
    ContentRouterDeps,
    'logger' | 'db' | 'radarrManager' | 'sonarrManager'
  >,
): Promise<RoutingOutcome | null> {
  const { logger } = deps
  const contentKey = context.itemKey || item.guids[0] || ''
  const existingRequest = await deps.db.getApprovalRequestByContent(
    context.userId,
    contentKey,
  )

  if (!existingRequest) {
    return null
  }

  switch (existingRequest.status) {
    case 'pending':
      logger.info(
        `Pending approval request already exists for "${item.title}" by user ${context.userName || context.userId}`,
      )
      return notRouted()

    case 'approved':
    case 'auto_approved':
      logger.info(
        `Using previously approved routing for "${item.title}" by user ${context.userName || context.userId}`,
      )
      return await routeUsingApprovedDecision(
        existingRequest,
        item,
        context,
        deps,
      )

    case 'rejected':
      logger.info(
        `Content "${item.title}" was previously rejected for user ${context.userName || context.userId}, skipping routing`,
      )
      return notRouted()

    case 'expired':
      logger.info(
        `Previous approval request for "${item.title}" by user ${context.userName || context.userId} has expired, allowing reprocessing`,
      )
      return null

    default:
      logger.info(
        `Existing approval request found with status "${existingRequest.status}" for "${item.title}" by user ${context.userName || context.userId}, skipping routing`,
      )
      return notRouted()
  }
}

/** Decisions must be the resolved rule matches in priority order, highest first. */
export async function checkApprovalRequirements(
  context: RoutingContext,
  decisions: RoutingDecision[],
  deps: Pick<ContentRouterDeps, 'db'>,
): Promise<ApprovalRequirement> {
  if (context.syncing) {
    return { required: false }
  }

  if (!context.userId) {
    return { required: false }
  }

  const user = await deps.db.getUser(context.userId)
  if (!user) {
    return { required: false }
  }

  const quotasBypassedByRule = decisions.some(
    (decision) => decision.bypassUserQuotas,
  )
  const approvalDecision = decisions.find(
    (decision) => decision.alwaysRequireApproval,
  )

  if (approvalDecision) {
    return {
      required: true,
      reason:
        approvalDecision.approvalReason ||
        `Approval required by router rule: ${approvalDecision.ruleName}`,
      trigger: 'router_rule',
      data: {
        ruleId: approvalDecision.ruleId,
        criteriaType: 'router_rule',
        criteriaValue: approvalDecision.ruleName,
        // processApprovedRequest reads this to skip quota recording
        quotasBypassedByRule,
      },
    }
  }

  if (user.requires_approval === true) {
    return {
      required: true,
      reason: `User "${user.name}" requires approval for all content`,
      trigger: 'manual_flag',
      data: {
        criteriaType: 'user_requires_approval',
        criteriaValue: user.name,
        quotasBypassedByRule,
      },
    }
  }

  return {
    required: false,
    data: { quotasBypassedByRule },
  }
}

function toApprovalRouting(
  decision: RoutingDecision,
  contentType: 'movie' | 'show',
): NonNullable<RouterDecision['routing']> {
  return {
    instanceId: decision.instanceId,
    instanceType: contentType === 'movie' ? 'radarr' : 'sonarr',
    qualityProfile: decision.qualityProfile,
    rootFolder: decision.rootFolder,
    tags: decision.tags,
    priority: decision.priority,
    searchOnAdd: decision.searchOnAdd,
    seasonMonitoring: decision.seasonMonitoring,
    seriesType: decision.seriesType,
    minimumAvailability: decision.minimumAvailability,
    monitor: decision.monitor,
    ruleId: decision.ruleId,
  }
}

type ApprovalRoutingProposal = Pick<
  NonNullable<RouterDecision['approval']>,
  'proposedRouting' | 'additionalRouting'
>

/** Pass syncedInstances only when the tail is sync expansion from default, otherwise the tail becomes additionalRouting. */
export function approvalRoutingFor(
  decisions: RoutingDecision[],
  contentType: 'movie' | 'show',
  syncedInstances: number[] | undefined,
): ApprovalRoutingProposal {
  const [primary, ...rest] = decisions
  if (!primary) {
    return {}
  }

  const proposedRouting = {
    ...toApprovalRouting(primary, contentType),
    syncedInstances:
      syncedInstances && syncedInstances.length > 0
        ? syncedInstances
        : undefined,
  }
  if (syncedInstances !== undefined) {
    return { proposedRouting }
  }

  // first decision per instance wins, matching execution order
  const seen = new Set([primary.instanceId])
  const additionalRouting = rest.flatMap((decision) => {
    if (seen.has(decision.instanceId)) return []
    seen.add(decision.instanceId)
    return [toApprovalRouting(decision, contentType)]
  })

  return {
    proposedRouting,
    additionalRouting:
      additionalRouting.length > 0 ? additionalRouting : undefined,
  }
}
