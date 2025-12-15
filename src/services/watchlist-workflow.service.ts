/**
 * Watchlist Workflow Service
 *
 * Handles the synchronization between Plex watchlists and Sonarr/Radarr using
 * efficient change detection and instant routing.
 *
 * Two mutually exclusive modes:
 * - RSS mode: 10-30s polling via RSS feeds for near-realtime detection
 * - ETag mode (fallback): 5-minute staggered polling with ±10% jitter per user
 *
 * Both modes include 2-hour periodic full reconciliation as a failsafe.
 *
 * Responsible for:
 * - Monitoring Plex watchlists for change detection
 * - Routing new items instantly to Sonarr/Radarr via content router
 * - Coordinating with other services (PlexWatchlist, SonarrManager, RadarrManager)
 * - Supporting user sync settings and approval workflows
 *
 * @example
 * // Starting the workflow in a Fastify plugin:
 * fastify.decorate('watchlistWorkflow', new WatchlistWorkflowService(log, fastify));
 * await fastify.watchlistWorkflow.startWorkflow();
 */

import type {
  EtagPollResult,
  EtagUserInfo,
  Item,
  TokenWatchlistItem,
  UserMapEntry,
} from '@root/types/plex.types.js'
import type { RssCacheInfo } from '@services/plex-watchlist/index.js'
import {
  type CachedRssItem,
  EtagPoller,
  handleLinkedItemsForLabelSync,
  type ItemCategorizerDeps,
  type ItemProcessorDeps,
  type RemovalHandlerDeps,
  type RssEtagPoller,
  type RssFeedCacheManager,
  type WatchlistSyncDeps,
} from '@services/plex-watchlist/index.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { DeferredRoutingQueue } from './deferred-routing-queue.service.js'
import {
  // Lifecycle
  checkAndSwitchModeIfNeeded,
  checkInitialRssCacheMode,
  cleanupExistingManualSync,
  cleanupWorkflow,
  // Fetching
  fetchWatchlists as fetchWatchlistsModule,
  getEtagFriendsList,
  handleStaggeredPollResult,
  initializeWorkflow,
  // Cache
  lookupUserByUuid,
  type ModeSwitcherState,
  // RSS
  processRssFriendsItems as processRssFriendsItemsModule,
  processRssSelfItems as processRssSelfItemsModule,
  type ReconcileState,
  // Orchestration
  reconcile as reconcileModule,
  refreshFriendsForStaggeredPolling,
  // Routing
  routeEnrichedItemsForUser as routeEnrichedItemsForUserModule,
  routeNewItemsForUser as routeNewItemsForUserModule,
  schedulePendingReconciliation,
  syncSingleFriend as syncSingleFriendModule,
  syncWatchlistItems as syncWatchlistItemsModule,
  unschedulePendingReconciliation,
  // Attribution
  updateAutoApprovalUserAttribution,
  updatePlexUuidCache,
} from './watchlist-workflow/index.js'

/** Represents the current state of the watchlist workflow */
type WorkflowStatus = 'stopped' | 'running' | 'starting' | 'stopping'

export class WatchlistWorkflowService {
  private readonly MANUAL_SYNC_JOB_NAME = 'periodic-watchlist-reconciliation'
  /** Current workflow status */
  private status: WorkflowStatus = 'stopped'
  /** Tracks if a reconciliation is currently in progress */
  private isReconciling = false
  /** Service logger that inherits parent log level changes */
  private readonly log: FastifyBaseLogger

  /** Tracks if the workflow is fully initialized */
  private initialized = false

  /** Tracks if the workflow is running in RSS mode */
  private rssMode = false

  /** Interval timer for checking RSS feeds */
  private rssCheckInterval: NodeJS.Timeout | null = null

  /** Flag to indicate if using RSS fallback */
  private isEtagFallbackActive = false

  /** Timestamp of the last successful watchlist sync */
  private lastSuccessfulSyncTime: number = Date.now()

  /** Poller for hybrid change detection */
  private etagPoller: EtagPoller | null = null

  /** RSS ETag poller for efficient HEAD-based change detection */
  private rssEtagPoller: RssEtagPoller | null = null

  /** RSS feed cache manager for item diffing and author tracking */
  private rssFeedCache: RssFeedCacheManager | null = null

  /** Debounce timer for syncAllStatuses after routing */
  private statusSyncDebounceTimer: NodeJS.Timeout | null = null

  /** Debounce delay for status sync in ms (1 minute) */
  private readonly STATUS_SYNC_DEBOUNCE_MS = 60 * 1000

  /**
   * In-memory cache mapping Plex user UUIDs (watchlistId) to user info.
   * Used for RSS author field lookups. Friends only - self-RSS is always primary user.
   * Populated during friend sync operations.
   */
  private plexUuidCache: Map<string, UserMapEntry> = new Map()

  /**
   * Queue for routing attempts that fail due to instance unavailability.
   * Retries automatically when instances recover.
   */
  private deferredRoutingQueue: DeferredRoutingQueue | null = null

  /** Tracks if RSS mode is disabled due to aggressive CDN caching */
  private rssCacheDisabled = false

  /** Last detected RSS cache info for logging/debugging */
  private lastRssCacheInfo: RssCacheInfo | null = null

  /**
   * Creates a new WatchlistWorkflowService instance
   *
   * @param log - Fastify logger instance for recording workflow operations
   * @param fastify - Fastify instance for accessing other services
   * @param rssCheckIntervalMs - Interval in ms between RSS feed checks
   */
  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    // RSS check interval: 10-30s with jitter for near-realtime detection
    private readonly rssCheckIntervalMs: number = 10_000 +
      Math.ceil(Math.random() * 20_000),
  ) {
    this.log = createServiceLogger(baseLog, 'WATCHLIST_WORKFLOW')
    this.log.info('Initializing Watchlist Workflow Service')
    // Initialize ETag poller (needs config, so created lazily after config is available)
  }

  /**
   * Access to application configuration
   */
  private get config() {
    return this.fastify.config
  }

  /**
   * Access to Plex watchlist service
   */
  private get plexService() {
    return this.fastify.plexWatchlist
  }

  /**
   * Access to content router service
   */
  private get contentRouter() {
    return this.fastify.contentRouter
  }

  /**
   * Access to Sonarr manager service
   */
  private get sonarrManager() {
    return this.fastify.sonarrManager
  }

  /**
   * Access to Radarr manager service
   */
  private get radarrManager() {
    return this.fastify.radarrManager
  }

  /**
   * Access to database service
   */
  private get dbService() {
    return this.fastify.db
  }

  /**
   * Access to status sync service
   */
  private get showStatusService() {
    return this.fastify.sync
  }

  /**
   * Gets the dependencies object for item categorization operations
   */
  private get categorizerDeps(): ItemCategorizerDeps {
    return {
      logger: this.log,
    }
  }

  /**
   * Gets the dependencies object for watchlist sync operations
   */
  private get watchlistSyncDeps(): WatchlistSyncDeps {
    return {
      db: this.dbService,
      logger: this.log,
    }
  }

  /**
   * Gets the dependencies object for removal handler operations
   */
  private get removalHandlerDeps(): RemovalHandlerDeps {
    return {
      db: this.dbService,
      logger: this.log,
      plexLabelSyncService: this.fastify.plexLabelSyncService,
    }
  }

  /**
   * Gets the dependencies object for item processor operations
   */
  private get itemProcessorDeps(): ItemProcessorDeps {
    return {
      db: this.dbService,
      logger: this.log,
      config: this.config,
      fastify: this.fastify,
      plexLabelSyncService: this.fastify.plexLabelSyncService,
      handleLinkedItemsForLabelSync: (linkItems) =>
        handleLinkedItemsForLabelSync(linkItems, this.removalHandlerDeps),
    }
  }

  /**
   * Get the current workflow status
   *
   * @returns Current workflow status
   */
  getStatus(): WorkflowStatus {
    return this.status
  }

  /**
   * Get the current RSS fallback status
   * @returns boolean indicating if the service is using RSS fallback
   */
  public getIsUsingRssFallback(): boolean {
    return this.isEtagFallbackActive
  }

  /**
   * Get the timestamp of the last successful sync
   * @returns timestamp of the last successful sync
   */
  public getLastSuccessfulSyncTime(): number {
    return this.lastSuccessfulSyncTime
  }

  /**
   * Check if the workflow is fully initialized
   *
   * @returns boolean indicating if the workflow is fully initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Check if the workflow is running in RSS mode
   *
   * @returns boolean indicating if the workflow is running in RSS mode
   */
  isRssMode(): boolean {
    return this.rssMode
  }

  /**
   * Start the watchlist workflow
   *
   * Initializes connections to Plex, fetches watchlists, sets up RSS feeds,
   * and starts the monitoring intervals.
   *
   * @returns Promise resolving to true if started successfully, false otherwise
   */
  async startWorkflow(): Promise<boolean> {
    try {
      // Set status to starting immediately
      this.status = 'starting'
      this.log.debug('Starting watchlist workflow initialization')

      // Initialize workflow components via extracted module
      const result = await initializeWorkflow({
        logger: this.log,
        plexService: this.plexService,
        sonarrManager: this.sonarrManager,
        radarrManager: this.radarrManager,
        cleanupExistingManualSync: () => this.cleanupExistingManualSync(),
        setupPeriodicReconciliation: () => this.setupPeriodicReconciliation(),
        routeEtagChange: (change) => this.routeNewItemsForUser(change),
        routeItemsForUser: (userId, items) =>
          this.routeEnrichedItemsForUser(userId, items),
        onQueueDrained: () => {
          this.updateAutoApprovalUserAttribution()
          this.scheduleDebouncedStatusSync()
        },
      })

      // Apply initialization results to service state
      this.rssMode = result.rssMode
      this.isEtagFallbackActive = result.isEtagFallbackActive
      this.rssEtagPoller = result.rssEtagPoller
      this.rssFeedCache = result.rssFeedCache
      this.deferredRoutingQueue = result.deferredRoutingQueue

      // Check RSS cache - if too aggressive, switch to ETag mode
      if (this.rssMode) {
        const { cacheInfo, shouldDisableRss } = await checkInitialRssCacheMode(
          this.config.selfRss,
          this.log,
        )
        this.lastRssCacheInfo = cacheInfo
        if (shouldDisableRss) {
          this.rssCacheDisabled = true
          this.rssMode = false
          this.isEtagFallbackActive = true
        }
      }

      // Establish baselines BEFORE reconciliation to detect changes during sync
      // Any items added while reconciliation runs will be caught on first poll
      if (this.rssMode && this.rssFeedCache) {
        const token = this.config.plexTokens?.[0]
        if (token) {
          this.log.debug('Priming RSS caches before reconciliation')
          await this.rssFeedCache.primeCaches(
            this.config.selfRss,
            this.config.friendsRss,
            token,
          )
        }
      } else if (!this.rssMode) {
        // ETag mode: establish baselines before sync
        this.log.debug('Establishing ETag baselines before reconciliation')
        if (!this.etagPoller) {
          this.etagPoller = new EtagPoller(this.config, this.log)
        }
        const primaryUser = await this.dbService.getPrimaryUser()
        if (primaryUser) {
          const friends = await this.getEtagFriendsList()
          await this.etagPoller.establishAllBaselines(primaryUser.id, friends)
        }
      }

      // Initial full reconciliation - syncs all users
      try {
        this.log.debug('Starting initial full reconciliation')
        await this.reconcile({ mode: 'full' })
        await this.schedulePendingReconciliation()
      } catch (syncError) {
        this.log.error(
          { error: syncError },
          'Error during initial reconciliation',
        )
        // Ensure failsafe is still scheduled even after initial sync failure
        try {
          await this.schedulePendingReconciliation()
        } catch (scheduleError) {
          this.log.error(
            { error: scheduleError },
            'Failed to schedule failsafe after initial sync error',
          )
        }
        throw new Error('Failed during initial reconciliation', {
          cause: syncError,
        })
      }

      // Start the appropriate change detection based on mode
      // RSS mode and ETag mode are mutually exclusive
      // Note: Baselines were established before reconciliation above
      if (this.rssMode) {
        // RSS mode: use RSS feeds for instant detection
        this.startRssCheck()
      } else {
        // ETag mode (fallback): use 5-minute staggered polling for change detection
        this.log.debug('Starting ETag staggered polling')
        this.startEtagCheckInterval()
      }

      // Update status to running
      this.status = 'running'
      this.initialized = true

      // Log the actual mode clearly:
      // - RSS mode: RSS feeds for instant detection + 2-hour full reconciliation
      // - ETag mode: 5-min staggered ETag polling + 2-hour full reconciliation (no RSS)
      if (this.isEtagFallbackActive) {
        this.log.info(
          'Watchlist workflow running in ETag mode (5-minute staggered polling, 2-hour full reconciliation)',
        )
      } else {
        this.log.info(
          'Watchlist workflow running in RSS mode (instant detection, 2-hour full reconciliation)',
        )
      }

      return true
    } catch (error) {
      this.status = 'stopped'
      this.initialized = false
      this.rssMode = false
      this.log.error({ error }, 'Error in Watchlist workflow')
      throw error
    }
  }

  /**
   * Stop the watchlist workflow.
   * Delegates component cleanup to extracted module while managing timers locally.
   *
   * @returns Promise resolving to true if stopped successfully, false otherwise
   */
  async stop(): Promise<boolean> {
    if (this.status !== 'running' && this.status !== 'starting') {
      this.log.warn(`Cannot stop workflow: current status is ${this.status}`)
      return false
    }

    this.log.info('Stopping Watchlist workflow')
    this.status = 'stopping'

    // Clear timers (service-level state)
    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
      this.rssCheckInterval = null
    }
    if (this.statusSyncDebounceTimer) {
      clearTimeout(this.statusSyncDebounceTimer)
      this.statusSyncDebounceTimer = null
    }

    // Cleanup workflow components via extracted module
    const result = await cleanupWorkflow(
      {
        etagPoller: this.etagPoller,
        rssEtagPoller: this.rssEtagPoller,
        rssFeedCache: this.rssFeedCache,
        deferredRoutingQueue: this.deferredRoutingQueue,
      },
      {
        logger: this.log,
        cleanupExistingManualSync: () => this.cleanupExistingManualSync(),
      },
    )

    // Apply cleanup results
    this.rssFeedCache = result.rssFeedCache
    this.deferredRoutingQueue = result.deferredRoutingQueue

    // Update status
    this.status = 'stopped'
    this.initialized = false
    this.rssMode = false

    return true
  }

  // ============================================================================
  // Hybrid Reconciliation
  // ============================================================================

  /**
   * Unified reconciliation entry point for hybrid RSS + ETag sync.
   * Delegates to extracted reconciler module.
   *
   * @param options.mode - 'full' for complete sync, 'etag' for lightweight ETag-based check
   */
  async reconcile(options: { mode: 'full' | 'etag' }): Promise<void> {
    const state: ReconcileState = {
      isReconciling: this.isReconciling,
      lastSuccessfulSyncTime: this.lastSuccessfulSyncTime,
    }
    await reconcileModule(options, this.reconcilerDeps, state, (updates) => {
      if (updates.isReconciling !== undefined)
        this.isReconciling = updates.isReconciling
      if (updates.lastSuccessfulSyncTime !== undefined)
        this.lastSuccessfulSyncTime = updates.lastSuccessfulSyncTime
    })
  }

  /**
   * Route pre-enriched, already-saved items for a user.
   * Delegates to extracted routing module.
   */
  private async routeEnrichedItemsForUser(
    userId: number,
    items: Item[],
  ): Promise<void> {
    return routeEnrichedItemsForUserModule(
      userId,
      items,
      this.contentRoutingDeps,
    )
  }

  /**
   * Sync a single friend's complete watchlist to DB.
   * Delegates to extracted friend handler module.
   */
  private async syncSingleFriend(
    friend: EtagUserInfo,
  ): Promise<{ brandNewItems: Item[]; linkedItems: Item[] }> {
    return syncSingleFriendModule(friend, this.syncSingleFriendDeps)
  }

  /**
   * Route new items for a specific user detected via change detection.
   * Delegates to extracted routing module.
   */
  private async routeNewItemsForUser(change: EtagPollResult): Promise<void> {
    return routeNewItemsForUserModule(change, this.rssProcessorDeps)
  }

  /** UUID cache deps for extracted cache functions */
  private get uuidCacheDeps() {
    return {
      logger: this.log,
      plexService: this.plexService,
    }
  }

  /** Watchlist fetcher deps */
  private get watchlistFetcherDeps() {
    return {
      logger: this.log,
      plexService: this.plexService,
      unschedulePendingReconciliation: () =>
        this.unschedulePendingReconciliation(),
    }
  }

  /** RSS processor deps */
  private get rssProcessorDeps() {
    return {
      logger: this.log,
      config: this.config,
      db: this.dbService,
      fastify: this.fastify,
      itemProcessorDeps: this.itemProcessorDeps,
      sonarrManager: this.sonarrManager,
      radarrManager: this.radarrManager,
      deferredRoutingQueue: this.deferredRoutingQueue,
      routeEnrichedItemsForUser: (userId: number, items: Item[]) =>
        this.routeEnrichedItemsForUser(userId, items),
      updateAutoApprovalUserAttribution: () =>
        this.updateAutoApprovalUserAttribution(),
      scheduleDebouncedStatusSync: () => this.scheduleDebouncedStatusSync(),
    }
  }

  /** RSS friends processor deps (extends rssProcessorDeps) */
  private get rssFriendsProcessorDeps() {
    return {
      ...this.rssProcessorDeps,
      lookupUserByUuid: (uuid: string) => this.lookupUserByUuid(uuid),
    }
  }

  /** Staggered poller deps */
  private get staggeredPollerDeps() {
    return {
      logger: this.log,
      config: this.config,
      db: this.dbService,
      fastify: this.fastify,
      plexService: this.plexService,
      sonarrManager: this.sonarrManager,
      radarrManager: this.radarrManager,
      etagPoller: this.etagPoller,
      deferredRoutingQueue: this.deferredRoutingQueue,
      itemProcessorDeps: this.itemProcessorDeps,
      routeEnrichedItemsForUser: (userId: number, items: Item[]) =>
        this.routeEnrichedItemsForUser(userId, items),
      syncSingleFriend: (userInfo: {
        userId: number
        username: string
        isPrimary: boolean
        watchlistId?: string
      }) => this.syncSingleFriend(userInfo),
      updatePlexUuidCache: (userMap: Map<string, UserMapEntry>) =>
        this.updatePlexUuidCache(userMap),
      updateAutoApprovalUserAttribution: () =>
        this.updateAutoApprovalUserAttribution(),
      scheduleDebouncedStatusSync: () => this.scheduleDebouncedStatusSync(),
    }
  }

  /** Content routing deps - used by routeShow, routeMovie, routeSingleItem, routeEnrichedItemsForUser */
  private get contentRoutingDeps() {
    return {
      logger: this.log,
      config: this.config,
      db: this.dbService,
      fastify: this.fastify,
      contentRouter: this.contentRouter,
      sonarrManager: this.sonarrManager,
      radarrManager: this.radarrManager,
      plexServerService: this.fastify.plexServerService,
      plexService: this.plexService,
    }
  }

  /** Sync engine deps - used by syncWatchlistItems */
  private get syncEngineDeps() {
    return {
      ...this.contentRoutingDeps,
      statusService: this.showStatusService,
      updateAutoApprovalUserAttributionWithPrefetch: (
        shows: unknown[],
        movies: unknown[],
        userById: Map<number, { id: number; name: string }>,
      ) =>
        this.updateAutoApprovalUserAttribution(
          shows as TokenWatchlistItem[],
          movies as TokenWatchlistItem[],
          userById as Map<
            number,
            Awaited<ReturnType<typeof this.dbService.getUser>>
          >,
        ),
    }
  }

  /** Single friend sync deps */
  private get syncSingleFriendDeps() {
    return {
      logger: this.log,
      config: this.config,
      db: this.dbService,
      categorizerDeps: this.categorizerDeps,
      watchlistSyncDeps: this.watchlistSyncDeps,
      itemProcessorDeps: this.itemProcessorDeps,
      removalHandlerDeps: this.removalHandlerDeps,
    }
  }

  /** Reconciler deps - used by reconcile */
  private get reconcilerDeps() {
    return {
      logger: this.log,
      config: this.config,
      db: this.dbService,
      fastify: this.fastify,
      plexService: this.plexService,
      sonarrManager: this.sonarrManager,
      radarrManager: this.radarrManager,
      etagPoller: this.etagPoller,
      deferredRoutingQueue: this.deferredRoutingQueue,
      syncWatchlistItems: () => this.syncWatchlistItems(),
      fetchWatchlists: () => this.fetchWatchlists(),
      routeNewItemsForUser: (change: EtagPollResult) =>
        this.routeNewItemsForUser(change),
      routeEnrichedItemsForUser: (userId: number, items: Item[]) =>
        this.routeEnrichedItemsForUser(userId, items),
      updateAutoApprovalUserAttribution: () =>
        this.updateAutoApprovalUserAttribution(),
      scheduleDebouncedStatusSync: () => this.scheduleDebouncedStatusSync(),
      getEtagPoller: () => this.etagPoller,
      setEtagPoller: (poller: EtagPoller) => {
        this.etagPoller = poller
      },
      syncSingleFriend: (userInfo: {
        userId: number
        username: string
        isPrimary: boolean
        watchlistId?: string
      }) => this.syncSingleFriend(userInfo),
      updatePlexUuidCache: (userMap: Map<string, UserMapEntry>) =>
        this.updatePlexUuidCache(userMap),
    }
  }

  /**
   * Updates the in-memory UUID cache from a userMap.
   */
  private updatePlexUuidCache(userMap: Map<string, UserMapEntry>): void {
    this.plexUuidCache = updatePlexUuidCache(userMap, this.uuidCacheDeps)
  }

  /**
   * Start ETag-based change detection.
   * Uses 5-minute staggered polling with ±10% jitter per user.
   * Only called in ETag mode (non-RSS fallback).
   */
  private startEtagCheckInterval(): void {
    void this.startStaggeredPolling().catch((error) => {
      this.log.error({ error }, 'Failed to start staggered ETag polling')
    })
  }

  /**
   * Start staggered polling for non-RSS mode.
   * Polls users sequentially with even distribution across 5-minute cycles.
   */
  private async startStaggeredPolling(): Promise<void> {
    if (!this.etagPoller) {
      this.etagPoller = new EtagPoller(this.config, this.log)
    }

    const primaryUser = await this.dbService.getPrimaryUser()
    if (!primaryUser) {
      this.log.warn('No primary user found, cannot start staggered polling')
      return
    }

    // Get initial friends list
    const friends = await this.getEtagFriendsList()

    // Start staggered polling with callbacks
    this.etagPoller.startStaggeredPolling(
      primaryUser.id,
      friends,
      // onUserChanged callback - handle watchlist changes
      async (result) => {
        await this.handleStaggeredPollResult(result)
      },
      // onCycleStart callback - refresh friends at start of each cycle
      async () => {
        return this.refreshFriendsForStaggeredPolling()
      },
    )
  }

  /**
   * Handle a staggered poll result when a user has new items.
   */
  private async handleStaggeredPollResult(
    result: EtagPollResult,
  ): Promise<void> {
    return handleStaggeredPollResult(result, this.staggeredPollerDeps)
  }

  /**
   * Refresh friends list at the start of each staggered polling cycle.
   */
  private async refreshFriendsForStaggeredPolling(): Promise<EtagUserInfo[]> {
    const result = await refreshFriendsForStaggeredPolling(
      this.plexUuidCache,
      this.staggeredPollerDeps,
    )
    this.plexUuidCache = result.updatedCache
    return result.friends
  }

  /**
   * Get friends list formatted for EtagPoller.
   */
  private async getEtagFriendsList(): Promise<EtagUserInfo[]> {
    return getEtagFriendsList({ plexService: this.plexService })
  }

  /**
   * Schedule a debounced syncAllStatuses call after routing.
   *
   * This batches multiple rapid routing operations (e.g., user adds several items
   * within seconds) into a single status sync call. The timer resets each time
   * new items are routed, and syncAllStatuses is called 1 minute after the last
   * routing operation.
   *
   * This prevents concurrent syncAllStatuses calls when RSS triggers multiple
   * ETag reconciliations in quick succession.
   */
  private scheduleDebouncedStatusSync(): void {
    // Clear any existing timer
    if (this.statusSyncDebounceTimer) {
      clearTimeout(this.statusSyncDebounceTimer)
      this.log.debug('Reset status sync debounce timer')
    }

    // Schedule new timer
    this.statusSyncDebounceTimer = setTimeout(async () => {
      this.statusSyncDebounceTimer = null
      try {
        this.log.debug('Debounced status sync triggered')
        const { shows: showUpdates, movies: movieUpdates } =
          await this.showStatusService.syncAllStatuses()
        this.log.info(
          `Status sync completed: ${showUpdates} show updates, ${movieUpdates} movie updates`,
        )
      } catch (error) {
        this.log.warn({ error }, 'Error in debounced status sync (non-fatal)')
      }
    }, this.STATUS_SYNC_DEBOUNCE_MS)

    this.log.debug(
      { delayMs: this.STATUS_SYNC_DEBOUNCE_MS },
      'Scheduled debounced status sync',
    )
  }

  /**
   * Fetch all watchlists (self and friends)
   */
  async fetchWatchlists(): Promise<void> {
    return fetchWatchlistsModule(this.watchlistFetcherDeps)
  }

  /**
   * Start the RSS check interval
   *
   * Sets up periodic checking of RSS feeds for changes using the
   * RssFeedCacheManager. Each poll:
   * 1. Checks feed ETags (HEAD request)
   * 2. If changed, fetches content and diffs against cache
   * 3. New items are enriched via GUID lookup and routed
   *
   * Self-RSS: Items attributed to primary user
   * Friends-RSS: Items attributed by author UUID lookup
   */
  private startRssCheck(): void {
    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
    }

    // Note: RSS caches are primed before reconciliation in startWorkflow()
    // This ensures we detect items added during the sync process

    this.rssCheckInterval = setInterval(async () => {
      try {
        if (!this.rssFeedCache) {
          this.log.warn('RSS feed cache not initialized, skipping check')
          return
        }

        const token = this.config.plexTokens?.[0]
        if (!token) {
          this.log.warn('No Plex token available for RSS check')
          return
        }

        // Check both feeds - each returns only truly NEW items
        const selfUrl = this.config.selfRss
        const friendsUrl = this.config.friendsRss

        // Process self feed (primary user items)
        if (selfUrl) {
          const selfResult = await this.rssFeedCache.checkSelfFeed(
            selfUrl,
            token,
          )
          if (selfResult.changed && selfResult.newItems.length > 0) {
            this.log.info(
              { newItems: selfResult.newItems.length },
              'New items detected in self RSS feed',
            )
            await this.processRssSelfItems(selfResult.newItems)
          }
        }

        // Process friends feed (items attributed by author UUID)
        if (friendsUrl) {
          const friendsResult = await this.rssFeedCache.checkFriendsFeed(
            friendsUrl,
            token,
          )
          if (friendsResult.changed && friendsResult.newItems.length > 0) {
            this.log.info(
              { newItems: friendsResult.newItems.length },
              'New items detected in friends RSS feed',
            )
            await this.processRssFriendsItems(friendsResult.newItems)
          }
        }
      } catch (error) {
        this.log.error(
          {
            error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Error checking RSS feeds',
        )
      }
    }, this.rssCheckIntervalMs)
  }

  /**
   * Process new items from self RSS feed (primary user).
   */
  private async processRssSelfItems(items: CachedRssItem[]): Promise<void> {
    return processRssSelfItemsModule(items, this.rssProcessorDeps)
  }

  /**
   * Process new items from friends RSS feed.
   */
  private async processRssFriendsItems(items: CachedRssItem[]): Promise<void> {
    return processRssFriendsItemsModule(items, this.rssFriendsProcessorDeps)
  }

  /**
   * Look up user ID by Plex UUID (author field).
   * First checks cache, then refreshes friend list if not found.
   */
  private async lookupUserByUuid(uuid: string): Promise<number | null> {
    const result = await lookupUserByUuid(
      uuid,
      this.plexUuidCache,
      this.uuidCacheDeps,
    )
    this.plexUuidCache = result.cache
    return result.userId
  }

  /**
   * Synchronize watchlist items between Plex, Sonarr, and Radarr.
   * Delegates to extracted sync engine module.
   */
  private async syncWatchlistItems(): Promise<void> {
    await syncWatchlistItemsModule(this.syncEngineDeps)
  }

  private async setupPeriodicReconciliation(): Promise<void> {
    try {
      // Create the periodic job with simple sync logic - no conditional checks
      await this.fastify.scheduler.scheduleJob(
        this.MANUAL_SYNC_JOB_NAME,
        async (_jobName: string) => {
          try {
            // Skip if workflow is not running
            if (this.status !== 'running') {
              this.log.debug(
                'Skipping periodic reconciliation - workflow not running',
              )
              return
            }

            this.log.info(
              'Periodic reconciliation triggered - performing full sync',
            )

            // Unschedule this job to prevent concurrent execution
            await this.unschedulePendingReconciliation()

            try {
              // Check RSS cache and hot-swap modes if needed
              const modeResult = await checkAndSwitchModeIfNeeded(
                this.modeSwitcherDeps,
                this.modeSwitcherState,
                this.modeSwitcherCallbacks,
              )
              this.lastRssCacheInfo = modeResult.cacheInfo
              if (modeResult.switched && modeResult.stateUpdate) {
                this.rssMode = modeResult.stateUpdate.rssMode
                this.isEtagFallbackActive =
                  modeResult.stateUpdate.isEtagFallbackActive
                this.rssCacheDisabled = modeResult.stateUpdate.rssCacheDisabled
                this.log.info({ newMode: modeResult.newMode }, 'Mode switched')
              }

              // Perform full reconciliation (this also re-establishes baselines)
              // Note: Change detection (RSS or ETag) continues during reconciliation
              // to catch new items - deduplication handles any overlap
              await this.reconcile({ mode: 'full' })

              // Update timing trackers
              this.lastSuccessfulSyncTime = Date.now()

              this.log.info('Periodic reconciliation completed successfully')
            } finally {
              // Schedule next periodic reconciliation
              await this.schedulePendingReconciliation()
            }
          } catch (error) {
            this.log.error(
              {
                error,
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              },
              'Error in periodic watchlist reconciliation',
            )

            // Still try to reschedule even after error
            try {
              await this.schedulePendingReconciliation()
            } catch (scheduleError) {
              this.log.error(
                { error: scheduleError },
                'Failed to reschedule after reconciliation error',
              )
            }
          }
        },
      )

      this.log.info(
        'Periodic watchlist reconciliation job created (will be dynamically scheduled)',
      )
    } catch (error) {
      this.log.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Error setting up periodic reconciliation',
      )
      throw error
    }
  }

  private async cleanupExistingManualSync(): Promise<void> {
    return cleanupExistingManualSync(this.schedulerDeps)
  }

  /** Attribution deps for extracted attribution functions */
  private get attributionDeps() {
    return {
      logger: this.log,
      db: this.dbService,
      fastify: this.fastify,
    }
  }

  /**
   * Updates auto-approval records that were created with System user (ID: 0)
   * to attribute them to the actual users who added the content to their watchlists.
   */
  private async updateAutoApprovalUserAttribution(
    prefetchedShows?: TokenWatchlistItem[],
    prefetchedMovies?: TokenWatchlistItem[],
    userById?: Map<number, Awaited<ReturnType<typeof this.dbService.getUser>>>,
  ): Promise<void> {
    return updateAutoApprovalUserAttribution(this.attributionDeps, {
      shows: prefetchedShows,
      movies: prefetchedMovies,
      userById,
    })
  }

  /** Scheduler deps for extracted lifecycle functions */
  private get schedulerDeps() {
    return {
      logger: this.log,
      fastify: this.fastify,
      jobName: this.MANUAL_SYNC_JOB_NAME,
    }
  }

  /** Mode switcher deps */
  private get modeSwitcherDeps() {
    return {
      log: this.log,
      config: this.config,
      getPrimaryUser: () => this.dbService.getPrimaryUser(),
      getEtagFriendsList: () => this.getEtagFriendsList(),
    }
  }

  /** Mode switcher state - mutable references to service state */
  private get modeSwitcherState(): ModeSwitcherState {
    return {
      rssMode: this.rssMode,
      isEtagFallbackActive: this.isEtagFallbackActive,
      rssCacheDisabled: this.rssCacheDisabled,
      lastRssCacheInfo: this.lastRssCacheInfo,
      rssCheckInterval: this.rssCheckInterval,
      etagPoller: this.etagPoller,
      rssFeedCache: this.rssFeedCache,
      rssEtagPoller: this.rssEtagPoller,
    }
  }

  /** Mode switcher callbacks */
  private get modeSwitcherCallbacks() {
    return {
      startRssCheck: () => this.startRssCheck(),
      startEtagCheckInterval: () => this.startEtagCheckInterval(),
    }
  }

  /**
   * Schedule the next periodic reconciliation to run in 2 hours.
   */
  private async schedulePendingReconciliation(): Promise<void> {
    return schedulePendingReconciliation(this.schedulerDeps)
  }

  /**
   * Cancel any pending periodic reconciliation job
   */
  private async unschedulePendingReconciliation(): Promise<void> {
    return unschedulePendingReconciliation(this.schedulerDeps)
  }
}
