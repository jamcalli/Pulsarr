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
import { routeToArr, settingsFromDecision } from './routing-capture.js'
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
    // highest priority first, the order both the gate and execution use
    allDecisions.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
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

    if (defaultRoutings.length > 0) {
      await createAutoApprovalRecord(
        {
          item,
          context,
          applied: defaultRoutings[0],
          syncedInstances: defaultRoutings
            .slice(1)
            .map((routing) => routing.instanceId),
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
  const processedInstanceIds = new Set<number>()

  for (const decision of allDecisions) {
    // only the highest priority decision per instance is routed
    if (processedInstanceIds.has(decision.instanceId)) {
      logger.debug(
        `Skipping duplicate routing to instance ${decision.instanceId} for "${item.title}"`,
      )
      continue
    }

    processedInstanceIds.add(decision.instanceId)

    const ruleInfo = decision.ruleName ? ` via rule "${decision.ruleName}"` : ''

    logger.info(
      {
        title: item.title,
        instanceId: decision.instanceId,
        ruleId: decision.ruleId,
        ruleName: decision.ruleName,
        priority: decision.priority ?? 50,
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
      routingDetails.push({
        ...applied,
        ruleId: decision.ruleId,
        ruleName: decision.ruleName,
      })
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

  if (routingDetails.length > 0) {
    await createAutoApprovalRecord(
      {
        item: enrichedItem,
        context,
        applied: routingDetails[0],
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
