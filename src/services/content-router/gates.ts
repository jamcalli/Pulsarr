import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
} from '@root/types/router.types.js'
import {
  checkApprovalRequirements,
  checkExistingApprovalRequest,
  proposedRoutingFor,
} from './approval-checks.js'
import type { ContentRouterDeps, GateOutcome } from './types.js'

export interface GateParams {
  item: ContentItem
  context: RoutingContext
  decisions: RoutingDecision[]
  syncedInstances: number[] | undefined
}

/** Bypass users are always uncapped. */
async function isWatchlistCapped(
  userId: number,
  contentType: 'movie' | 'show',
  userName: string | undefined,
  deps: Pick<ContentRouterDeps, 'db' | 'notifications'>,
): Promise<boolean> {
  const quota = await deps.db.getUserQuota(userId, contentType)
  if (
    !quota ||
    quota.watchlistCap == null ||
    quota.watchlistCap <= 0 ||
    quota.bypassApproval
  )
    return false

  const count = await deps.db.getWatchlistUsage(userId, contentType)
  const capped = count > quota.watchlistCap

  if (capped) {
    deps.notifications.sendWatchlistCapReached({
      userId,
      userName: userName ?? null,
      contentType,
      currentCount: count,
      cap: quota.watchlistCap,
    })
  }

  return capped
}

/** Pass syncedInstances only for default routing, because approving a request fans out to them. */
export async function applyPreRoutingGates(
  params: GateParams,
  deps: Pick<
    ContentRouterDeps,
    | 'logger'
    | 'db'
    | 'rules'
    | 'approvalService'
    | 'quotaService'
    | 'notifications'
    | 'radarrManager'
    | 'sonarrManager'
  >,
): Promise<GateOutcome> {
  const { item, context, decisions, syncedInstances } = params
  const { logger } = deps
  if (context.syncing) {
    return { action: 'proceed' }
  }

  const existingResult = await checkExistingApprovalRequest(item, context, deps)
  if (existingResult) {
    return { action: 'handled', result: existingResult }
  }

  if (context.userId > 0) {
    if (
      await isWatchlistCapped(
        context.userId,
        context.contentType,
        context.userName,
        deps,
      )
    ) {
      logger.info(
        `Watchlist cap reached for "${item.title}" by user ${context.userName || context.userId}, skipping`,
      )
      return { action: 'blocked' }
    }
  }

  // no decisions means nothing routes, so no quota may be consumed
  if (decisions.length === 0) {
    return { action: 'proceed' }
  }

  const approvalResult = await checkApprovalRequirements(item, context, deps)

  if (approvalResult.required) {
    logger.info(
      `Approval required for "${item.title}" by user ${context.userName || context.userId}: ${approvalResult.reason}`,
    )

    await deps.approvalService.createApprovalRequest(
      {
        id: context.userId,
        name: context.userName || `User ${context.userId}`,
      },
      item,
      {
        action: 'require_approval',
        approval: {
          reason: approvalResult.reason || 'Approval required',
          triggeredBy: approvalResult.trigger || 'manual_flag',
          data: approvalResult.data || {},
          proposedRouting: proposedRoutingFor(
            decisions[0],
            context.contentType,
            syncedInstances,
          ),
        },
      },
      approvalResult.trigger || 'manual_flag',
      approvalResult.reason,
      undefined,
      context.itemKey,
      approvalResult.data?.ruleId,
    )

    return { action: 'blocked' }
  }

  // check and record in one transaction so concurrent items cannot all pass the check
  if (context.userId > 0) {
    const quotasBypassedByRule =
      approvalResult.data?.quotasBypassedByRule ?? false

    if (quotasBypassedByRule) {
      logger.debug(
        `Skipping quota consumption for "${item.title}" - router rule bypasses quotas`,
      )
      return { action: 'proceed' }
    }

    const quotaResult = await deps.quotaService.tryConsumeQuota(
      context.userId,
      context.contentType,
    )

    if (quotaResult.hasQuota && !quotaResult.consumed) {
      const wouldBeUsage = quotaResult.currentUsage + 1

      logger.info(
        `Quota exceeded for "${item.title}" by user ${context.userName || context.userId}: ${quotaResult.quotaType} (${wouldBeUsage}/${quotaResult.quotaLimit})`,
      )

      if (quotaResult.userBypassEnabled) {
        logger.info(
          `User ${context.userId} has quota bypass enabled, auto-approving quota-exceeded item "${item.title}"`,
        )
        return { action: 'proceed' }
      }

      const approvalReasonText = `${quotaResult.quotaType} quota exceeded (${wouldBeUsage}/${quotaResult.quotaLimit})`

      await deps.approvalService.createApprovalRequest(
        {
          id: context.userId,
          name: context.userName || `User ${context.userId}`,
        },
        item,
        {
          action: 'require_approval',
          approval: {
            reason: approvalReasonText,
            triggeredBy: 'quota_exceeded',
            data: {
              quotaType: quotaResult.quotaType as
                | 'daily'
                | 'weekly_rolling'
                | 'monthly',
              quotaUsage: wouldBeUsage,
              quotaLimit: quotaResult.quotaLimit,
            },
            proposedRouting: proposedRoutingFor(
              decisions[0],
              context.contentType,
              syncedInstances,
            ),
          },
        },
        'quota_exceeded',
        approvalReasonText,
        undefined,
        context.itemKey,
      )

      logger.info(
        `Created approval request for quota-exceeded item "${item.title}"`,
      )

      return { action: 'blocked' }
    }

    if (quotaResult.consumed) {
      logger.debug(
        `Quota consumed for user ${context.userId}: ${quotaResult.currentUsage}/${quotaResult.quotaLimit} for ${context.contentType}`,
      )
    }
  }

  return { action: 'proceed' }
}
