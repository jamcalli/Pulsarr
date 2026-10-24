import { DEFAULT_ROUTE_PRIORITY } from '@root/schemas/content-router/content-router.schema.js'
import type {
  ContentItem,
  RoutingContext,
  RoutingDecision,
  RoutingDetails,
} from '@root/types/router.types.js'
import { createAutoApprovalRecord } from './auto-approval.js'
import {
  getDefaultRoutingDecisions,
  routeUsingDefault,
} from './default-routing.js'
import { enrichItemMetadata } from './enrichment.js'
import { applyPreRoutingGates } from './gates.js'
import {
  decidedRouting,
  routeToArr,
  settingsFromDecision,
} from './routing-capture.js'
import { evaluateRules } from './rule-resolver.js'
import { routeSyncTarget } from './sync-targets.js'
import {
  type ContentRouterDeps,
  notRouted,
  type RouteContentOptions,
  type RoutingOutcome,
} from './types.js'

/** Rejects when routing state cannot be read, leaving the item unrouted for the next reconciliation. */
export async function routeContent(
  item: ContentItem,
  key: string,
  options: RouteContentOptions,
  deps: ContentRouterDeps,
): Promise<RoutingOutcome> {
  const { logger } = deps
  const contentType = item.type

  logger.info(
    {
      title: item.title,
      contentType,
      syncing: options.syncing,
      userId: options.userId,
      userName: options.userName,
    },
    `Routing ${contentType} "${item.title}"${options.syncing ? ' during sync operation' : ''}`,
  )

  const allRouterRules = await deps.rules.get()

  const hasAnyRules = allRouterRules.some((rule) => rule.enabled)

  const targetType = contentType === 'movie' ? 'radarr' : 'sonarr'
  const hasRulesTargetingSyncInstance =
    options.syncing && options.syncTargetInstanceId !== undefined
      ? allRouterRules.some(
          (rule) =>
            rule.enabled &&
            rule.target_type === targetType &&
            rule.target_instance_id === options.syncTargetInstanceId,
        )
      : false

  const context: RoutingContext = {
    userId: options.userId,
    userName: options.userName,
    itemKey: key,
    contentType,
    syncing: options.syncing,
    syncTargetInstanceId: options.syncTargetInstanceId,
  }

  const enrichedItem = hasAnyRules
    ? await enrichItemMetadata(allRouterRules, item, context, deps)
    : item

  // an exclude match is a veto and must never fall through to the default path
  const allDecisions: RoutingDecision[] = []

  if (hasAnyRules) {
    const resolution = evaluateRules(
      logger,
      allRouterRules,
      enrichedItem,
      context,
    )

    if (resolution.skipReason === 'excluded') {
      return notRouted()
    }

    allDecisions.push(...resolution.decisions)
  }

  // sync is internal data movement, so it bypasses the gates
  if (options.syncing && options.syncTargetInstanceId !== undefined) {
    return await routeSyncTarget(
      {
        item,
        key,
        userId: options.userId,
        syncTargetInstanceId: options.syncTargetInstanceId,
        decisions: allDecisions,
        hasRulesTargetingSyncInstance,
      },
      deps,
    )
  }

  if (allDecisions.length === 0) {
    logger.info(
      hasAnyRules
        ? `No matching routing rules for "${item.title}", using default routing`
        : `No routing rules exist, using default routing for "${item.title}"`,
    )

    const defaultRoutingDecisions = await getDefaultRoutingDecisions(
      contentType,
      deps,
    )

    // the default tail is sync expansion, so it belongs in the approval record's syncedInstances
    const gateOutcome = await applyPreRoutingGates(
      {
        item: enrichedItem,
        context,
        decisions: defaultRoutingDecisions,
        syncedInstances: defaultRoutingDecisions
          .slice(1)
          .map((d) => d.instanceId),
      },
      deps,
    )
    if (gateOutcome.action === 'handled') {
      return gateOutcome.result
    }
    if (gateOutcome.action === 'blocked') {
      return notRouted()
    }

    const defaultRoutings = await routeUsingDefault(
      item,
      key,
      options.userId,
      options.syncing,
      deps,
    )

    const [primaryDecision, ...syncedDecisions] = defaultRoutingDecisions
    if (defaultRoutings.length > 0 && primaryDecision) {
      await createAutoApprovalRecord(
        {
          item,
          context,
          proposed:
            defaultRoutings.find(
              (routing) => routing.instanceId === primaryDecision.instanceId,
            ) ?? decidedRouting(primaryDecision, targetType),
          additional: [],
          syncedInstances: syncedDecisions.map((d) => d.instanceId),
        },
        deps,
      )
    }

    return {
      routedInstances: defaultRoutings.map((routing) => routing.instanceId),
      routingDetails: defaultRoutings,
    }
  }

  // rule-matched tails are independent targets, never sync expansion
  const gateOutcome = await applyPreRoutingGates(
    {
      item: enrichedItem,
      context,
      decisions: allDecisions,
      syncedInstances: undefined,
    },
    deps,
  )
  if (gateOutcome.action === 'handled') {
    return gateOutcome.result
  }
  if (gateOutcome.action === 'blocked') {
    return notRouted()
  }

  const routingDetails: RoutingDetails[] = []
  const decidedByInstance = new Map<number, RoutingDetails>()

  for (const decision of allDecisions) {
    // only the highest priority decision per instance is routed
    if (decidedByInstance.has(decision.instanceId)) {
      logger.debug(
        `Skipping duplicate routing to instance ${decision.instanceId} for "${item.title}"`,
      )
      continue
    }

    decidedByInstance.set(
      decision.instanceId,
      decidedRouting(decision, targetType),
    )

    const ruleInfo = decision.ruleName ? ` via rule "${decision.ruleName}"` : ''

    logger.info(
      {
        title: item.title,
        instanceId: decision.instanceId,
        ruleId: decision.ruleId,
        ruleName: decision.ruleName,
        priority: decision.priority ?? DEFAULT_ROUTE_PRIORITY,
      },
      `Routing "${item.title}" to instance ID ${decision.instanceId}${ruleInfo}`,
    )

    try {
      const applied = await routeToArr(
        {
          item,
          key,
          userId: options.userId,
          instanceId: decision.instanceId,
          syncing: options.syncing ?? false,
        },
        settingsFromDecision(decision),
        deps,
      )
      const appliedRouting = {
        ...applied,
        ruleId: decision.ruleId,
        ruleName: decision.ruleName,
      }
      routingDetails.push(appliedRouting)
      decidedByInstance.set(decision.instanceId, appliedRouting)
    } catch (routeError) {
      logger.error(
        { error: routeError },
        `Error routing "${item.title}" to instance ${decision.instanceId}`,
      )
    }
  }

  logger.info(
    `Successfully routed "${item.title}" to ${routingDetails.length} instances`,
  )

  const [proposed, ...additional] = decidedByInstance.values()
  if (routingDetails.length > 0 && proposed) {
    await createAutoApprovalRecord(
      {
        item: enrichedItem,
        context,
        proposed,
        additional,
        syncedInstances: undefined,
      },
      deps,
    )
  }

  return {
    routedInstances: routingDetails.map((routing) => routing.instanceId),
    routingDetails,
  }
}
