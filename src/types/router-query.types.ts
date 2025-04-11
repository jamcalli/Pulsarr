/**
 * Router Query Builder Types
 *
 * This file defines the type system for the query builder pattern used in the content router.
 * It includes interfaces for predicates, queries, context, and plugin factories.
 */
import type {
  RoutingContext,
  RoutingDecision,
  RouterRule,
} from './router.types.js'
import type { SonarrItem } from './sonarr.types.js'
import type { Item as RadarrItem } from './radarr.types.js'
import type {
  RadarrMovieLookupResponse,
  SonarrSeriesLookupResponse,
} from './content-lookup.types.js'

// Union type for content items that can be routed
export type ContentItem = SonarrItem | RadarrItem

/**
 * Extended router rule with conditions
 */
export interface CompleteRouterRule extends RouterRule {
  conditions?: RouterCondition[]
}

/**
 * Database representation of a router condition
 */
export interface RouterCondition {
  id: number
  rule_id: number
  predicate_type: string
  operator: string
  value: string // JSON string
  group_id: number | null
  group_operator: string | null
  parent_group_id: number | null
  order_index: number
  created_at: string
  updated_at: string
}

/**
 * Enhanced metadata about the content being routed
 */
export interface ContentMetadata {
  // Basic information
  originalLanguage?: string
  releaseYear?: number

  // IDs
  tmdbId?: number
  imdbId?: string
  tvdbId?: number

  // Additional details
  certification?: string
  country?: string
  runtime?: number
  studio?: string
  network?: string

  // Status information
  status?: string
  ended?: boolean

  // Raw API response data
  radarrData?: RadarrMovieLookupResponse | RadarrMovieLookupResponse[]
  sonarrData?: SonarrSeriesLookupResponse | SonarrSeriesLookupResponse[]
}

/**
 * Enhanced routing context with additional metadata
 */
export interface EnhancedContext extends RoutingContext {
  metadata: ContentMetadata
}

/**
 * A predicate function that determines if content matches a particular criterion
 */
export type Predicate = (
  item: ContentItem,
  context: EnhancedContext,
) => Promise<boolean>

/**
 * Operators for combining predicates
 */
export type LogicalOperator = 'AND' | 'OR' | 'NOT'

/**
 * A group of predicates with a specified operator
 */
export interface PredicateGroup {
  predicates: Array<Predicate | PredicateGroup>
  operator: LogicalOperator
}

/**
 * Route information associated with a query
 */
export interface RouteTarget {
  instanceId: number
  qualityProfile?: number | null
  rootFolder?: string | null
  weight: number
}

/**
 * Content query builder interface
 */
export interface ContentQuery {
  // Basic predicate operations
  where(predicate: Predicate): ContentQuery
  whereNot(predicate: Predicate): ContentQuery

  // Compound logical operations
  and(builder: (query: ContentQuery) => void): ContentQuery
  or(builder: (query: ContentQuery) => void): ContentQuery

  // Target information for routing
  routeTo(target: RouteTarget): ContentQuery

  // Execute the query against a content item
  execute(
    item: ContentItem,
    context: EnhancedContext,
  ): Promise<RoutingDecision[] | null>
}

/**
 * Interface for predicate factory plugins
 */
export interface PredicateFactoryPlugin<T = unknown> {
  name: string // Unique identifier for this predicate type
  displayName: string // Human-friendly name
  description: string

  // Core methods
  createPredicate(criteria: T): Predicate

  // UI metadata to help build the interface
  getSupportedOperators(): string[]
  getValueType(): 'string' | 'number' | 'boolean' | 'array' | 'object'

  // Optional helper methods for the UI
  getOperatorLabel?(operator: string): string
  getSampleValues?(): T[]
}
