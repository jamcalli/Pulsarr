import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  AppliedRadarrRouting,
  AppliedSonarrRouting,
  ContentItem,
  RouteSettings,
  RoutingDecision,
  RoutingDetails,
} from '@root/types/router.types.js'
import type { SonarrItem } from '@root/types/sonarr.types.js'
import type { AppliedSettings, ContentRouterDeps } from './types.js'

export interface ArrTarget {
  item: ContentItem
  key: string
  userId: number
  instanceId: number
  syncing: boolean
}

export interface ArrRouted {
  routing: RoutingDetails
  settings: AppliedSettings
}

function appliedSettings(
  applied: AppliedRadarrRouting | AppliedSonarrRouting,
): AppliedSettings {
  const base = {
    qualityProfile:
      applied.qualityProfileName ?? applied.qualityProfile?.toString(),
    rootFolder: applied.rootFolder,
    tags: applied.tags,
    searchOnAdd: applied.searchOnAdd,
  }
  return applied.instanceType === 'radarr'
    ? {
        ...base,
        minimumAvailability: applied.minimumAvailability,
        monitor: applied.monitor,
      }
    : {
        ...base,
        seasonMonitoring: applied.seasonMonitoring,
        seriesType: applied.seriesType,
      }
}

/** Propagates manager errors so the caller decides whether one failed instance stops the rest. */
export async function routeToArr(
  target: ArrTarget,
  settings: RouteSettings,
  deps: Pick<ContentRouterDeps, 'radarrManager' | 'sonarrManager'>,
): Promise<ArrRouted> {
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
  const { qualityProfileName, ...routing } = applied
  return {
    routing: { ...routing, qualityProfile: routing.qualityProfile?.toString() },
    settings: appliedSettings(applied),
  }
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
