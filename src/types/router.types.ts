import type { SonarrItem } from './sonarr.types.js'
import type { Item as RadarrItem } from './radarr.types.js'

export type ContentItem = SonarrItem | RadarrItem

export interface RoutingDecision {
  instanceId: number
  qualityProfile?: number | string | null
  rootFolder?: string | null
  tags?: string[]
  weight: number // Higher number = higher priority, but doesn't exclude other routes
}

export interface RoutingContext {
  userId?: number
  userName?: string
  itemKey: string
  contentType: 'movie' | 'show'
  syncing?: boolean
}

export interface RouterPlugin {
  name: string
  description: string
  enabled: boolean
  order: number // Controls plugin execution order

  // Main routing logic - can return multiple routing decisions
  evaluateRouting(
    item: ContentItem,
    context: RoutingContext,
  ): Promise<RoutingDecision[] | null>
}

export interface RouterRule {
  id: number
  name: string
  type: string
  criteria: Record<string, CriteriaValue>
  target_type: 'sonarr' | 'radarr'
  target_instance_id: number
  root_folder?: string | null
  quality_profile?: number | null
  order: number
  enabled: boolean
  metadata?: Record<string, CriteriaValue> | null
  created_at: string
  updated_at: string
}

export type CriteriaValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | null
