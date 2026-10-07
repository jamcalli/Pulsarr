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
import { evaluateCondition } from './conditions.js'
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

export async function checkApprovalRequirements(
  item: ContentItem,
  context: RoutingContext,
  deps: Pick<ContentRouterDeps, 'logger' | 'db' | 'rules'>,
): Promise<ApprovalRequirement> {
  const { logger } = deps
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

  const allRouterRules = await deps.rules.get()
  const expectedTargetType =
    context.contentType === 'movie' ? 'radarr' : 'sonarr'
  let quotasBypassedByRule = false

  for (const rule of allRouterRules) {
    if (!rule.enabled) continue
    if (rule.target_type !== expectedTargetType) continue
    if (rule.exclude_from_routing) continue
    if (rule.target_instance_id == null) continue

    if (rule.criteria && typeof rule.criteria === 'object') {
      if (!rule.criteria.condition) {
        logger.error(
          `Router rule ${rule.id} ("${rule.name}") has no condition in criteria - skipping`,
        )
        continue
      }
      const condition = rule.criteria.condition
      const matches = evaluateCondition(condition, item, context, logger)

      if (matches) {
        if (rule.bypass_user_quotas) {
          quotasBypassedByRule = true
        }

        if (rule.always_require_approval) {
          return {
            required: true,
            reason:
              rule.approval_reason ||
              `Approval required by router rule: ${rule.name}`,
            trigger: 'router_rule',
            data: {
              ruleId: rule.id,
              criteriaType: 'router_rule',
              criteriaValue: rule.name,
              // processApprovedRequest reads this to skip quota recording
              quotasBypassedByRule,
            },
          }
        } else {
          logger.debug(
            {
              scope: 'checkApprovalRequirements',
              ruleName: rule.name,
              ruleWeight: rule.order,
              ruleId: rule.id,
              itemTitle: item.title,
            },
            'Router rule bypassing approval for item',
          )
          break
        }
      }
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
      },
    }
  }

  return {
    required: false,
    data: { quotasBypassedByRule },
  }
}

/** Pass syncedInstances only when the tail is sync expansion from default, never independent rule decisions. */
export function proposedRoutingFor(
  primary: RoutingDecision | undefined,
  contentType: 'movie' | 'show',
  syncedInstances: number[] | undefined,
): RouterDecision['routing'] {
  if (!primary) {
    return undefined
  }

  return {
    instanceId: primary.instanceId,
    instanceType: contentType === 'movie' ? 'radarr' : 'sonarr',
    qualityProfile: primary.qualityProfile,
    rootFolder: primary.rootFolder,
    tags: primary.tags,
    priority: primary.priority,
    searchOnAdd: primary.searchOnAdd,
    seasonMonitoring: primary.seasonMonitoring,
    seriesType: primary.seriesType,
    minimumAvailability: primary.minimumAvailability,
    monitor: primary.monitor,
    syncedInstances:
      syncedInstances && syncedInstances.length > 0
        ? syncedInstances
        : undefined,
  }
}
