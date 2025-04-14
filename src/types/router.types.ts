import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from '@root/types/content-lookup.types.js'

export interface ContentItem {
  title: string
  type: string
  guids: string[]
  genres?: string[]
  // Will be enriched with additional metadata
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
  order: number
  enabled: boolean
  metadata?: RadarrMovieLookupResponse | SonarrSeriesLookupResponse | null
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
  qualityProfile?: number | string | null
  rootFolder?: string | null
  tags?: string[]
  priority: number // Higher number = higher priority
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

// Base condition interface
export interface Condition {
  field: string
  operator: ComparisonOperator
  value: unknown
  negate?: boolean
}

// Group condition for nesting
export interface ConditionGroup {
  operator: LogicalOperator
  conditions: Array<Condition | ConditionGroup>
  negate?: boolean
}

// Core interface for routing evaluators
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

  // Optional helper methods can be defined in individual evaluators
  // but they won't be called directly by the ContentRouterService
  [key: string]: unknown
}
