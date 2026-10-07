import type { ApprovalRequest } from '@root/types/approval.types.js'
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

/** An instance that already holds the item counts as routed, and any other add failure is logged and skipped. */
export async function routeUsingApprovedDecision(
  approvedRequest: ApprovalRequest,
  item: ContentItem,
  context: RoutingContext,
  deps: Pick<ContentRouterDeps, 'logger' | 'radarrManager' | 'sonarrManager'>,
): Promise<RoutingOutcome> {
  const { logger } = deps
  try {
    const proposedRouting =
      approvedRequest.proposedRouterDecision?.approval?.proposedRouting

    if (!proposedRouting?.instanceId) {
      logger.error(
        { approvedRequest },
        'Approved request has invalid routing decision',
      )
      return notRouted()
    }

    const routedInstances: number[] = []
    const instanceId = proposedRouting.instanceId
    const label = item.type === 'movie' ? 'Radarr' : 'Sonarr'
    const base = {
      item,
      key: context.itemKey,
      userId: approvedRequest.userId ?? 0,
    }

    const primaryRouted = await replayToInstance(
      { ...base, instanceId, syncing: context.syncing ?? false },
      {
        rootFolder: proposedRouting.rootFolder,
        qualityProfile: proposedRouting.qualityProfile,
        tags: proposedRouting.tags || [],
        searchOnAdd: proposedRouting.searchOnAdd,
        minimumAvailability: proposedRouting.minimumAvailability,
        monitor: proposedRouting.monitor,
        seasonMonitoring: proposedRouting.seasonMonitoring,
        seriesType: proposedRouting.seriesType,
      },
      label,
      deps,
    )
    if (primaryRouted) routedInstances.push(instanceId)

    for (const syncedId of proposedRouting.syncedInstances ?? []) {
      const syncedRouted = await replayToInstance(
        { ...base, instanceId: syncedId, syncing: true },
        {},
        `synced ${label}`,
        deps,
      )
      if (syncedRouted) routedInstances.push(syncedId)
    }

    const routingDetails: RoutingDetails[] = [
      {
        instanceId: proposedRouting.instanceId,
        instanceType:
          approvedRequest.contentType === 'movie' ? 'radarr' : 'sonarr',
        qualityProfile: proposedRouting.qualityProfile,
        rootFolder: proposedRouting.rootFolder,
        tags: proposedRouting.tags,
        searchOnAdd: proposedRouting.searchOnAdd,
        minimumAvailability: proposedRouting.minimumAvailability,
        monitor: proposedRouting.monitor,
        seasonMonitoring: proposedRouting.seasonMonitoring,
        seriesType: proposedRouting.seriesType,
        ruleId: approvedRequest.routerRuleId ?? undefined,
      },
    ]

    return { routedInstances, routingDetails }
  } catch (error) {
    logger.error({ error }, 'Error routing using approved decision')
    return notRouted()
  }
}
