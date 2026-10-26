import type { ContentItem, RoutingDecision } from '@root/types/router.types.js'
import { routeToArr, settingsFromDecision } from './routing-capture.js'
import { logSkipped, logSynced, type RoutingLog } from './routing-log.js'
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
  syncSourceInstanceId: number | undefined
  decisions: RoutingDecision[]
  hasRulesTargetingSyncInstance: boolean
  routingLog: RoutingLog
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
    syncSourceInstanceId,
    decisions,
    hasRulesTargetingSyncInstance,
    routingLog,
  } = params
  const { logger } = deps
  const contentType = item.type
  const routedInstances: number[] = []

  const syncTargetDecision = decisions.find(
    (d) => d.instanceId === syncTargetInstanceId,
  )

  if (syncTargetDecision) {
    logger.debug(
      `Sync: Router rules allow "${item.title}" to instance ${syncTargetInstanceId}`,
    )

    try {
      const { settings } = await routeToArr(
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
      logSynced(
        routingLog,
        syncTargetInstanceId,
        syncSourceInstanceId,
        settings,
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
    logSkipped(routingLog, {
      reason: 'routed-elsewhere',
      instanceId: syncTargetInstanceId,
      ruleInstanceIds: decisions.map((d) => d.instanceId),
    })
    return notRouted()
  }

  if (hasRulesTargetingSyncInstance) {
    logSkipped(routingLog, {
      reason: 'no-rule-match',
      instanceId: syncTargetInstanceId,
    })
    return notRouted()
  }

  logger.debug(
    `No router rules target instance ${syncTargetInstanceId} for ${contentType}, proceeding with sync for "${item.title}"`,
  )

  try {
    const { settings } = await routeToArr(
      { item, key, userId, instanceId: syncTargetInstanceId, syncing: true },
      {},
      deps,
    )
    logSynced(routingLog, syncTargetInstanceId, syncSourceInstanceId, settings)
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
