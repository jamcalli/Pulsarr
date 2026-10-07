import type { ComparisonOperator } from '@root/schemas/content-router/content-router.schema.js'
import type {
  MinimumAvailability,
  RadarrMonitorType,
} from '@root/schemas/radarr/add-options.schema.js'
import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'
import type { TmdbWatchProviderData } from '@root/types/tmdb.types.js'

export interface ContentItem {
  title: string
  type: 'movie' | 'show'
  guids: string[]
  genres?: string[]
  metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse
  // Rating data - undefined: not fetched; null: known missing; value: present
  imdb?: {
    rating?: number | null
    votes?: number | null
  }
  // Rotten Tomatoes ratings (0-10 scale)
  rtCritic?: number | null
  rtAudience?: number | null
  // TMDB rating (0-10 scale)
  tmdb?: number | null
  // TMDB watch providers for streaming availability routing
  watchProviders?: TmdbWatchProviderData
  listMemberships?: Set<string>
}

export interface RouterRule {
  id: number
  name: string
  type: string
  criteria: {
    condition: Condition | ConditionGroup
  }
  target_type: 'sonarr' | 'radarr'
  target_instance_id: number | null
  root_folder?: string | null
  quality_profile?: number | null
  tags?: string[]
  order: number
  enabled: boolean
  metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null
  search_on_add?: boolean | null
  season_monitoring?: string | null
  series_type?: 'standard' | 'anime' | 'daily' | null
  monitor?: RadarrMonitorType | null
  // Actions - approval behavior
  always_require_approval?: boolean
  bypass_user_quotas?: boolean
  approval_reason?: string | null
  // When true, content matching this rule is never routed to Radarr/Sonarr
  exclude_from_routing?: boolean
  created_at: string
  updated_at: string
}

export interface RoutingContext {
  userId: number
  userName?: string
  contentType: 'movie' | 'show'
  itemKey: string
  syncing?: boolean
  syncTargetInstanceId?: number
}

export interface TargetInstancesResult {
  instanceIds: number[]
  // Set when an empty list is a deliberate outcome (skip toggle or exclude
  // rule) rather than a misconfiguration
  skipReason?: 'default-skip' | 'excluded'
}

export interface RoutingDecision {
  instanceId: number
  /**
   * Quality profile identifier - supports both ID and name:
   * - number: Direct profile ID for Radarr/Sonarr API
   * - string: Profile name that will be resolved to ID by service layer
   * - null: No profile specified, use instance default
   */
  qualityProfile?: number | string | null
  rootFolder?: string | null
  tags?: string[]
  priority: number // Higher number = higher priority
  searchOnAdd?: boolean | null // Whether to automatically search when added
  seasonMonitoring?: string | null // For Sonarr: which seasons to monitor
  seriesType?: 'standard' | 'anime' | 'daily' | null // For Sonarr: series type
  minimumAvailability?: MinimumAvailability
  monitor?: RadarrMonitorType | null
  /**
   * ID of the router rule that produced this decision
   */
  ruleId?: number
  /**
   * Name of the router rule that produced this decision (for logging)
   */
  ruleName?: string
}

/**
 * Routing details for notification payloads.
 * Simplified version of RoutingDecision with instance type for external consumers.
 */
export interface RoutingDetails {
  instanceId: number
  instanceType: 'radarr' | 'sonarr'
  qualityProfile?: number | string | null
  rootFolder?: string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  minimumAvailability?: MinimumAvailability | null
  monitor?: RadarrMonitorType | null
  seasonMonitoring?: string | null
  seriesType?: string | null
  ruleId?: number
  ruleName?: string
}

/** Null or absent means use the instance's value at routing time. */
export interface RadarrRouteSettings {
  rootFolder?: string | null
  qualityProfile?: number | string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  minimumAvailability?: MinimumAvailability | null
  monitor?: RadarrMonitorType | null
}

/** Null or absent means use the instance's value at routing time. */
export interface SonarrRouteSettings {
  rootFolder?: string | null
  qualityProfile?: number | string | null
  tags?: string[]
  searchOnAdd?: boolean | null
  seasonMonitoring?: string | null
  seriesType?: 'standard' | 'anime' | 'daily' | null
}

export type RouteSettings = RadarrRouteSettings & SonarrRouteSettings

export interface AppliedRadarrRouting {
  instanceId: number
  instanceType: 'radarr'
  qualityProfile: number | undefined
  rootFolder: string | undefined
  tags: string[]
  searchOnAdd: boolean
  minimumAvailability: MinimumAvailability
  monitor: RadarrMonitorType
}

export interface AppliedSonarrRouting {
  instanceId: number
  instanceType: 'sonarr'
  qualityProfile: number | undefined
  rootFolder: string | undefined
  tags: string[]
  searchOnAdd: boolean
  seasonMonitoring: string
  seriesType: 'standard' | 'anime' | 'daily'
}

// Condition system types
export type LogicalOperator = 'AND' | 'OR'

// Base condition interface
export interface Condition {
  field: string
  operator: ComparisonOperator
  value: unknown
  negate?: boolean
  _cid?: string
}

// Group condition for nesting
export interface ConditionGroup {
  operator: LogicalOperator
  conditions: Array<Condition | ConditionGroup>
  negate?: boolean
  _cid?: string
}
