import type { ContentItem, RoutingDecision } from '@root/types/router.types.js'
import { routeToArr, settingsFromDecision } from './routing-capture.js'
import {
  type ContentRouterDeps,
  notRouted,
  type RoutingOutcome,
} from './types.js'

export interface SyncTargetParams {
  item: ContentItem
  key: string
  userId: number
  syncTargetInstanceId: number
  decisions: RoutingDecision[]
  hasRulesTargetingSyncInstance: boolean
}

/** Sync bypasses every gate and never writes an approval record, and an add failure rethrows so callers can tell it from a rule block. */
export async function routeSyncTarget(
  params: SyncTargetParams,
  deps: Pick<ContentRouterDeps, 'logger' | 'radarrManager' | 'sonarrManager'>,
): Promise<RoutingOutcome> {
  const {
    item,
    key,
    userId,
    syncTargetInstanceId,
    decisions,
    hasRulesTargetingSyncInstance,
  } = params
  const { logger } = deps
  const contentType = item.type
  const routedInstances: number[] = []

  const syncTargetDecision = decisions.find(
    (d) => d.instanceId === syncTargetInstanceId,
  )

  if (syncTargetDecision) {
    logger.info(
      `Sync: Router rules allow "${item.title}" to instance ${syncTargetInstanceId}`,
    )

    try {
      await routeToArr(
        {
          item,
          key,
          userId,
          instanceId: syncTargetInstanceId,
          syncing: true,
        },
        settingsFromDecision(syncTargetDecision),
        deps,
      )
      routedInstances.push(syncTargetInstanceId)
    } catch (error) {
      logger.error(
        { error },
        `Error syncing "${item.title}" to instance ${syncTargetInstanceId}`,
      )
      throw error
    }

    return { routedInstances, routingDetails: [] }
  }

  if (decisions.length > 0) {
    logger.info(
      `Sync blocked: Router rules route "${item.title}" to other instances (${decisions.map((d) => d.instanceId).join(', ')}), not to sync target ${syncTargetInstanceId}`,
    )
    return notRouted()
  }

  if (hasRulesTargetingSyncInstance) {
    logger.info(
      `No routing decisions for "${item.title}" during sync - router rules targeting instance ${syncTargetInstanceId} exist but didn't match. Sync prevented by router rules.`,
    )
    return notRouted()
  }

  logger.info(
    `No router rules target instance ${syncTargetInstanceId} for ${contentType}, proceeding with sync for "${item.title}"`,
  )

  try {
    await routeToArr(
      { item, key, userId, instanceId: syncTargetInstanceId, syncing: true },
      {},
      deps,
    )
    routedInstances.push(syncTargetInstanceId)
  } catch (error) {
    logger.error(
      { error },
      `Error routing "${item.title}" to sync target instance ${syncTargetInstanceId}`,
    )
    throw error
  }

  return { routedInstances, routingDetails: [] }
}
