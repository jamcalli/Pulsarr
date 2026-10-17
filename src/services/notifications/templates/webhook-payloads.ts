import type {
  MinimumAvailability,
  RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import { SONARR_SERIES_TYPES } from '@root/schemas/sonarr/series-type.schema.js'
import type {
  RadarrRoutingPayload,
  RoutedToItem,
  SonarrRoutingPayload,
  WebhookContent,
  WebhookUser,
} from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type { RouterDecision } from '@root/types/approval.types.js'
import { buildPosterUrl } from '@root/utils/poster-url.js'

type ApprovalRouting = NonNullable<RouterDecision['routing']>

/** Routing fields the webhook payload leaves out. */
type OmittedRoutingField = 'priority' | 'ruleId'

type UnplacedRoutingField = Exclude<
  keyof ApprovalRouting,
  keyof RadarrRoutingPayload | keyof SonarrRoutingPayload | OmittedRoutingField
>

/** Keeps only the fields relevant to the instance type. A routing field neither sent nor omitted fails typecheck at every caller. */
export function buildRoutingPayload(
  routing: ApprovalRouting & Record<UnplacedRoutingField, never>,
): RadarrRoutingPayload | SonarrRoutingPayload {
  if (routing.instanceType === 'radarr') {
    return {
      instanceType: 'radarr',
      instanceId: routing.instanceId,
      qualityProfile: routing.qualityProfile ?? null,
      rootFolder: routing.rootFolder ?? null,
      tags: routing.tags ?? [],
      searchOnAdd: routing.searchOnAdd ?? null,
      minimumAvailability: routing.minimumAvailability ?? null,
      monitor: routing.monitor ?? null,
      syncedInstances: routing.syncedInstances,
    }
  }
  return {
    instanceType: 'sonarr',
    instanceId: routing.instanceId,
    qualityProfile: routing.qualityProfile ?? null,
    rootFolder: routing.rootFolder ?? null,
    tags: routing.tags ?? [],
    searchOnAdd: routing.searchOnAdd ?? null,
    seasonMonitoring: routing.seasonMonitoring ?? null,
    seriesType: routing.seriesType ?? null,
    syncedInstances: routing.syncedInstances,
  }
}

interface UserSource<Name extends string | null> {
  id: number
  name: Name
  alias?: string | null
}

export function buildUserPayload<Name extends string | null>(
  user: UserSource<Name>,
): Omit<WebhookUser, 'username'> & { username: Name } {
  return {
    userId: user.id,
    username: user.name,
    alias: user.alias ?? undefined,
  }
}

interface ContentSource {
  title: string
  type: 'movie' | 'show'
  key: string
  guids: string[]
  thumb?: string | null
}

export function buildContentPayload(content: ContentSource): WebhookContent {
  return {
    title: content.title,
    type: content.type,
    key: content.key,
    guids: content.guids,
    posterUrl: buildPosterUrl(content.thumb, 'notification') ?? undefined,
  }
}

interface RoutedToInput {
  instanceType: 'radarr' | 'sonarr'
  instanceId: number
  qualityProfile?: string | number | null
  rootFolder?: string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  ruleId?: number
  ruleName?: string
  minimumAvailability?: MinimumAvailability | null
  monitor?: RadarrMonitorType | null
  seasonMonitoring?: string | null
  seriesType?: string | null
}

/** Keeps only the fields relevant to the instance type. */
export function buildRoutedToItem(detail: RoutedToInput): RoutedToItem {
  if (detail.instanceType === 'radarr') {
    return {
      instanceType: 'radarr',
      instanceId: detail.instanceId,
      qualityProfile: detail.qualityProfile ?? undefined,
      rootFolder: detail.rootFolder ?? undefined,
      tags: detail.tags,
      searchOnAdd: detail.searchOnAdd ?? undefined,
      ruleId: detail.ruleId,
      ruleName: detail.ruleName,
      minimumAvailability: detail.minimumAvailability ?? undefined,
      monitor: detail.monitor ?? undefined,
    }
  }
  return {
    instanceType: 'sonarr',
    instanceId: detail.instanceId,
    qualityProfile: detail.qualityProfile ?? undefined,
    rootFolder: detail.rootFolder ?? undefined,
    tags: detail.tags,
    searchOnAdd: detail.searchOnAdd ?? undefined,
    ruleId: detail.ruleId,
    ruleName: detail.ruleName,
    seasonMonitoring: detail.seasonMonitoring ?? undefined,
    seriesType: SONARR_SERIES_TYPES.find((type) => type === detail.seriesType),
  }
}
