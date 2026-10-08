import type {
  ApprovalRequest,
  RouterDecision,
} from '@root/types/approval.types.js'
import type {
  ContentItem,
  RouteSettings,
  RoutingContext,
  RoutingDetails,
} from '@root/types/router.types.js'
import { isArrAlreadyAddedError } from '@utils/arr-error.js'
import { type ArrTarget, routeToArr } from './routing-capture.js'
import {
  type ContentRouterDeps,
  notRouted,
  type RoutingOutcome,
} from './types.js'

type ApprovalRouting = NonNullable<RouterDecision['routing']>

export function settingsFromRouting(routing: ApprovalRouting): RouteSettings {
  return {
    rootFolder: routing.rootFolder,
    qualityProfile: routing.qualityProfile,
    tags: routing.tags || [],
    searchOnAdd: routing.searchOnAdd,
    minimumAvailability: routing.minimumAvailability,
    monitor: routing.monitor,
    seasonMonitoring: routing.seasonMonitoring,
    seriesType: routing.seriesType,
  }
}

function detailsFromRouting(routing: ApprovalRouting): RoutingDetails {
  return {
    instanceId: routing.instanceId,
    instanceType: routing.instanceType,
    qualityProfile: routing.qualityProfile,
    rootFolder: routing.rootFolder,
    tags: routing.tags,
    searchOnAdd: routing.searchOnAdd,
    minimumAvailability: routing.minimumAvailability,
    monitor: routing.monitor,
    seasonMonitoring: routing.seasonMonitoring,
    seriesType: routing.seriesType,
    ruleId: routing.ruleId,
  }
}

async function replayToInstance(
  target: ArrTarget,
  settings: RouteSettings,
  label: string,
  deps: Pick<ContentRouterDeps, 'logger' | 'radarrManager' | 'sonarrManager'>,
): Promise<boolean> {
  const { logger } = deps
  const { item, instanceId } = target
  try {
    await routeToArr(target, settings, deps)
    logger.info(
      `Successfully routed approved content "${item.title}" to ${label} instance ${instanceId}`,
    )
    return true
  } catch (error) {
    if (isArrAlreadyAddedError(error)) {
      logger.info(
        `Approved content "${item.title}" already exists in ${label} instance ${instanceId}, treating as routed`,
      )
      return true
    }
    logger.error(
      { error },
      `Failed to route approved content "${item.title}" to ${label} instance ${instanceId}`,
    )
    return false
  }
}

export function approvedDestinations(
  approvedRequest: ApprovalRequest,
): number[] {
  const { proposedRouting, additionalRouting } =
    approvedRequest.proposedRouterDecision?.approval ?? {}
  if (!proposedRouting?.instanceId) return []
  return [
    proposedRouting.instanceId,
    ...(proposedRouting.syncedInstances ?? []),
    ...(additionalRouting ?? []).map((routing) => routing.instanceId),
  ]
}

/** Replays only onlyInstanceIds when given, counts an instance that already holds the item as routed, and logs and skips any other add failure. */
export async function routeUsingApprovedDecision(
  approvedRequest: ApprovalRequest,
  item: ContentItem,
  context: RoutingContext,
  deps: Pick<ContentRouterDeps, 'logger' | 'radarrManager' | 'sonarrManager'>,
  onlyInstanceIds?: number[],
): Promise<RoutingOutcome> {
  const { logger } = deps
  const replays = (instanceId: number) =>
    !onlyInstanceIds || onlyInstanceIds.includes(instanceId)
  try {
    const { proposedRouting, additionalRouting } =
      approvedRequest.proposedRouterDecision?.approval ?? {}

    if (!proposedRouting?.instanceId) {
      logger.error(
        { approvedRequest },
        'Approved request has invalid routing decision',
      )
      return notRouted()
    }

    const routedInstances: number[] = []
    const routingDetails: RoutingDetails[] = []
    const instanceId = proposedRouting.instanceId
    const label = item.type === 'movie' ? 'Radarr' : 'Sonarr'
    const base = {
      item,
      key: context.itemKey,
      userId: approvedRequest.userId ?? 0,
    }

    if (replays(instanceId)) {
      const primaryRouted = await replayToInstance(
        { ...base, instanceId, syncing: context.syncing ?? false },
        settingsFromRouting(proposedRouting),
        label,
        deps,
      )
      if (primaryRouted) {
        routedInstances.push(instanceId)
        routingDetails.push({
          ...detailsFromRouting(proposedRouting),
          ruleId:
            proposedRouting.ruleId ?? approvedRequest.routerRuleId ?? undefined,
        })
      }
    }

    for (const syncedId of proposedRouting.syncedInstances ?? []) {
      if (!replays(syncedId)) continue
      const syncedRouted = await replayToInstance(
        { ...base, instanceId: syncedId, syncing: true },
        {},
        `synced ${label}`,
        deps,
      )
      if (syncedRouted) routedInstances.push(syncedId)
    }

    for (const routing of additionalRouting ?? []) {
      if (!replays(routing.instanceId)) continue
      const routed = await replayToInstance(
        {
          ...base,
          instanceId: routing.instanceId,
          syncing: context.syncing ?? false,
        },
        settingsFromRouting(routing),
        label,
        deps,
      )
      if (!routed) continue
      routedInstances.push(routing.instanceId)
      routingDetails.push(detailsFromRouting(routing))
    }

    return { routedInstances, routingDetails }
  } catch (error) {
    logger.error({ error }, 'Error routing using approved decision')
    return notRouted()
  }
}
