/**
 * Watchlist Workflow Types
 *
 * Shared types and dependency interfaces for watchlist workflow modules.
 * Each handler function receives a deps object matching one of these interfaces.
 */

import type { Config } from '@root/types/config.types.js'
import type {
  EtagPollResult,
  Item,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { ContentRouterService } from '@services/content-router.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { DeferredRoutingQueue } from '@services/deferred-routing-queue.service.js'
import type { NotificationService } from '@services/notification.service.js'
import type { PlexLabelSyncService } from '@services/plex-label-sync.service.js'
import type { PlexServerService } from '@services/plex-server.service.js'
import type { EtagPoller } from '@services/plex-watchlist/etag/etag-poller.js'
import type { ItemProcessorDeps } from '@services/plex-watchlist/orchestration/item-processor.js'
import type { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { StatusService } from '@services/watchlist-status.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

// ============================================================================
// Base Dependencies
// ============================================================================

/**
 * Base deps shared by most handlers
 */
export interface BaseDeps {
  logger: FastifyBaseLogger
  config: Config
  db: DatabaseService
  fastify: FastifyInstance
}

// ============================================================================
// Routing Dependencies
// ============================================================================

/**
 * Parameters for unified content routing
 */
export interface ContentRoutingParams {
  item: Item
  userId: number
  userName: string | undefined
}

/**
 * Routing deps - used by content-router, item-router
 */
export interface ContentRoutingDeps extends BaseDeps {
  contentRouter: ContentRouterService
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  plexServerService: PlexServerService
  plexService: PlexWatchlistService
  notifications: NotificationService
}

/**
 * Health check deps - for the repeated health-check-and-queue pattern
 */
export interface HealthCheckDeps {
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
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
}

// ============================================================================
// Sync Engine Dependencies
// ============================================================================

/**
 * Sync deps - used by sync-engine
 */
export interface SyncEngineDeps extends ContentRoutingDeps {
  statusService: StatusService
  /** Callback to update auto-approval attribution with prefetched data */
  updateAutoApprovalUserAttributionWithPrefetch: (
    shows: unknown[],
    movies: unknown[],
    userById: Map<number, { id: number; name: string }>,
  ) => Promise<void>
}

// ============================================================================
// RSS Processing Dependencies
// ============================================================================

/**
 * RSS processing deps - used by rss-self-processor
 */
export interface RssProcessorDeps extends BaseDeps {
  itemProcessorDeps: ItemProcessorDeps
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  deferredRoutingQueue: DeferredRoutingQueue | null
  /** Bound callback for routing enriched items */
  routeEnrichedItemsForUser: (userId: number, items: Item[]) => Promise<void>
  /** Bound callback for updating approval attribution */
  updateAutoApprovalUserAttribution: () => Promise<void>
  /** Bound callback for scheduling debounced status sync */
  scheduleDebouncedStatusSync: () => void
}

/**
 * RSS friends processor deps - extends RssProcessorDeps with UUID lookup
 */
export interface RssFriendsProcessorDeps extends RssProcessorDeps {
  /** Bound callback for looking up user ID by Plex UUID */
  lookupUserByUuid: (uuid: string) => Promise<number | null>
}

// ============================================================================
// Reconciliation Dependencies
// ============================================================================

/**
 * Reconciliation deps - used by reconciler, friend-handler
 */
export interface ReconcilerDeps extends BaseDeps {
  plexService: PlexWatchlistService
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  etagPoller: EtagPoller | null
  deferredRoutingQueue: DeferredRoutingQueue | null
  /** Bound callback for syncing watchlist items */
  syncWatchlistItems: () => Promise<void>
  /** Bound callback for fetching watchlists */
  fetchWatchlists: () => Promise<void>
  /** Bound callback for routing new items from ETag changes */
  routeNewItemsForUser: (change: EtagPollResult) => Promise<void>
  /** Bound callback for routing enriched items */
  routeEnrichedItemsForUser: (userId: number, items: Item[]) => Promise<void>
  /** Bound callback for updating approval attribution */
  updateAutoApprovalUserAttribution: () => Promise<void>
  /** Bound callback for scheduling debounced status sync */
  scheduleDebouncedStatusSync: () => void
}

/**
 * Friend handler deps - extends ReconcilerDeps with UUID lookup, label sync, and friend sync
 */
export interface FriendHandlerDeps extends ReconcilerDeps {
  /** Bound callback for looking up user ID by Plex UUID */
  lookupUserByUuid: (uuid: string) => Promise<number | null>
  /** Bound callback for syncing a single friend's watchlist */
  syncSingleFriend: (userInfo: {
    userId: number
    username: string
    isPrimary: boolean
    watchlistId?: string
  }) => Promise<{ brandNewItems: Item[]; linkedItems: Item[] }>
  /** Bound callback for updating UUID cache */
  updatePlexUuidCache: (userMap: Map<string, UserMapEntry>) => void
  plexLabelSyncService?: PlexLabelSyncService
}

// ============================================================================
// Lifecycle Dependencies
// ============================================================================

/**
 * Lifecycle deps - used by workflow-starter, scheduler
 */
export interface LifecycleDeps extends BaseDeps {
  plexService: PlexWatchlistService
  /** Bound callback for triggering reconciliation */
  reconcile: (options: { mode: 'full' | 'etag' }) => Promise<void>
}

// ============================================================================
// ETag Polling Dependencies
// ============================================================================

/**
 * Staggered poller deps - used by staggered-poller
 */
export interface StaggeredPollerDeps extends BaseDeps {
  plexService: PlexWatchlistService
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  etagPoller: EtagPoller | null
  deferredRoutingQueue: DeferredRoutingQueue | null
  itemProcessorDeps: ItemProcessorDeps
  /** Bound callback for routing enriched items */
  routeEnrichedItemsForUser: (userId: number, items: Item[]) => Promise<void>
  /** Bound callback for syncing a single friend */
  syncSingleFriend: (userInfo: {
    userId: number
    username: string
    isPrimary: boolean
    watchlistId?: string
  }) => Promise<{ brandNewItems: Item[]; linkedItems: Item[] }>
  /** Bound callback for updating UUID cache */
  updatePlexUuidCache: (userMap: Map<string, UserMapEntry>) => void
  /** Bound callback for updating approval attribution */
  updateAutoApprovalUserAttribution: () => Promise<void>
  /** Bound callback for scheduling debounced status sync */
  scheduleDebouncedStatusSync: () => void
}

// ============================================================================
// Cache Dependencies
// ============================================================================

/**
 * UUID cache deps - used by uuid-cache
 */
export interface UuidCacheDeps {
  logger: FastifyBaseLogger
  plexService: PlexWatchlistService
}

// ============================================================================
// Attribution Dependencies
// ============================================================================

/**
 * Attribution deps - used by approval-attributor
 */
export interface AttributionDeps {
  logger: FastifyBaseLogger
  db: DatabaseService
  fastify: FastifyInstance
}
