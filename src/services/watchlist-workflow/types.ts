/**
 * Watchlist Workflow Types
 *
 * Shared types and dependency interfaces for watchlist workflow modules.
 * Each handler function receives a deps object matching one of these interfaces.
 */

import type { Config } from '@root/types/config.types.js'
import type { Item } from '@root/types/plex.types.js'
import type { ContentRouterService } from '@services/content-router.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import type { NotificationService } from '@services/notification.service.js'
import type { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { ItemProcessorDeps } from '@services/plex-watchlist/orchestration/item-processor.js'
import type { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { StatusService } from '@services/watchlist-status.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { WorkflowState } from './state.js'

/**
 * Every deps object in this module is this shape or a Pick of it
 */
export interface WorkflowDeps {
  logger: FastifyBaseLogger
  config: Config
  db: DatabaseService
  fastify: FastifyInstance
  state: WorkflowState
  plexService: PlexWatchlistService
  contentRouter: ContentRouterService
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  plexServerService: PlexServerService
  notifications: NotificationService
  statusService: StatusService
  plexLabelSyncService?: PlexLabelSyncService
  itemProcessorDeps: ItemProcessorDeps
}

export type ContentRoutingDeps = Pick<
  WorkflowDeps,
  | 'logger'
  | 'config'
  | 'db'
  | 'fastify'
  | 'contentRouter'
  | 'sonarrManager'
  | 'radarrManager'
  | 'plexServerService'
  | 'plexService'
  | 'notifications'
>

/**
 * Parameters for unified content routing
 */
export interface ContentRoutingParams {
  item: Item
  userId: number
  userName: string | undefined
}

/**
 * Health check deps - for the repeated health-check-and-queue pattern
 */
export interface HealthCheckDeps {
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  plexServerService?: PlexServerService
  skipIfExistsOnPlex?: boolean
  deferredRoutingQueue: DeferredRoutingQueue | null
  logger: FastifyBaseLogger
}

/**
 * Result of instance health check
 */
export interface HealthCheckResult {
  available: boolean
  sonarrUnavailable: number[]
  radarrUnavailable: number[]
  plexServerUnreachable?: boolean
}
