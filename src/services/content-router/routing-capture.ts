import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  ContentItem,
  RouteSettings,
  RoutingDecision,
  RoutingDetails,
} from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { ContentRouterDeps } from './types.js'

export interface ArrTarget {
  item: ContentItem
  key: string
  userId: number
  instanceId: number
  syncing: boolean
}

/** Propagates manager errors so the caller decides whether one failed instance stops the rest. */
export async function routeToArr(
  target: ArrTarget,
  settings: RouteSettings,
  deps: Pick<ContentRouterDeps, 'radarrManager' | 'sonarrManager'>,
): Promise<RoutingDetails> {
  const { item, key, userId, instanceId, syncing } = target
  const applied =
    item.type === 'movie'
      ? await deps.radarrManager.routeItemToRadarr(
          item as RadarrItem,
          key,
          userId,
          instanceId,
          syncing,
          settings,
        )
      : await deps.sonarrManager.routeItemToSonarr(
          item as SonarrItem,
          key,
          userId,
          instanceId,
          syncing,
          settings,
        )
  return { ...applied, qualityProfile: applied.qualityProfile?.toString() }
}

export function settingsFromDecision(decision: RoutingDecision): RouteSettings {
  return {
    rootFolder: decision.rootFolder,
    qualityProfile: decision.qualityProfile,
    tags: decision.tags,
    searchOnAdd: decision.searchOnAdd,
    minimumAvailability: decision.minimumAvailability,
    monitor: decision.monitor,
    seasonMonitoring: decision.seasonMonitoring,
    seriesType: decision.seriesType,
  }
}

/** The routing a decision asked for, recorded for an instance whose add did not happen. */
export function decidedRouting(
  decision: RoutingDecision,
  instanceType: RoutingDetails['instanceType'],
): RoutingDetails {
  return {
    instanceId: decision.instanceId,
    instanceType,
    ...settingsFromDecision(decision),
    ruleId: decision.ruleId,
    ruleName: decision.ruleName,
  }
}
