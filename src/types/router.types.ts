import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'

export interface ContentItem {
  title: string
  type: 'movie' | 'show'
  guids: string[]
  genres?: string[]
  metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse
}

export interface RouterRule {
  id: number
  name: string
  type: string
  criteria: Record<string, unknown>
  target_type: 'sonarr' | 'radarr'
  target_instance_id: number
  root_folder?: string | null
  quality_profile?: number | null
  tags?: string[]
  order: number
  enabled: boolean
  metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null
  search_on_add?: boolean | null
  season_monitoring?: string | null
  series_type?: 'standard' | 'anime' | 'daily' | null
  created_at: string
  updated_at: string
}

export interface RoutingContext {
  userId?: number
  userName?: string
  contentType: 'movie' | 'show'
  itemKey: string
  syncing?: boolean
  syncTargetInstanceId?: number
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
  minimumAvailability?: 'announced' | 'inCinemas' | 'released' // For Radarr: minimum availability setting
}

// Condition system types
export type LogicalOperator = 'AND' | 'OR'
export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'in'
  | 'notIn'
  | 'regex'
  | 'between'

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

/**
 * Information about a supported field in a router evaluator
 */
export interface FieldInfo {
  name: string
  description: string
  valueTypes: string[]
}

/**
 * Information about a supported operator in a router evaluator
 */
export interface OperatorInfo {
  name: ComparisonOperator
  description: string
  valueTypes: string[]
  valueFormat?: string // Additional hints about expected format
}

// Then extend the RoutingEvaluator interface with these properties:

export interface RoutingEvaluator {
  name: string
  description: string
  priority: number

  // Whether this evaluator can handle this content
  canEvaluate(item: ContentItem, context: RoutingContext): Promise<boolean>

  // Main evaluation method
  evaluate(
    item: ContentItem,
    context: RoutingContext,
  ): Promise<RoutingDecision[] | null>

  // For conditional evaluator support
  evaluateCondition?(
    condition: Condition | ConditionGroup,
    item: ContentItem,
    context: RoutingContext,
  ): boolean

  // Helps ContentRouterService determine which fields this evaluator handles
  canEvaluateConditionField?(field: string): boolean

  // New metadata properties for self-describing evaluators
  supportedFields?: FieldInfo[]
  supportedOperators?: Record<string, OperatorInfo[]>

  // Content type this evaluator applies to ('radarr', 'sonarr', or 'both')
  contentType?: 'radarr' | 'sonarr' | 'both'

  // Optional helper methods can be defined in individual evaluators
  // but they won't be called directly by the ContentRouterService
  [key: string]: unknown
}
