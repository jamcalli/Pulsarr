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
  CachedRssItem,
  EtagPollResult,
  EtagUserInfo,
  Item,
} from '@root/types/plex.types.js'
import type { ProgressEvent } from '@root/types/progress.types.js'
import { handleLinkedItemsForLabelSync } from '@services/plex-watchlist/index.js'
import { createServiceLogger } from '@utils/logger.js'
import { systemStatusEvent } from '@utils/system-status-event.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import {
  // Lifecycle
  cleanupExistingManualSync,
  cleanupWorkflow,
  // Fetching
  fetchWatchlists as fetchWatchlistsModule,
  getEtagFriendsList,
  handleStaggeredPollResult,
  initializeWorkflow,
  // RSS
  processRssFriendsItems as processRssFriendsItemsModule,
  processRssSelfItems as processRssSelfItemsModule,
  RECONCILIATION_JOB_NAME,
  // Orchestration
  reconcile as reconcileModule,
  refreshFriendsForStaggeredPolling as refreshFriendsForStaggeredPollingModule,
  // Routing
  routeEnrichedItemsForUser as routeEnrichedItemsForUserModule,
  routeNewItemsForUser as routeNewItemsForUserModule,
  schedulePendingReconciliation,
  unschedulePendingReconciliation,
  // Attribution
  updateAutoApprovalUserAttribution,
  type WorkflowDeps,
  WorkflowState,
  type WorkflowStatus,
} from './watchlist-workflow/index.js'

export class WatchlistWorkflowService {
  /** Service logger that inherits parent log level changes */
  private readonly log: FastifyBaseLogger

  private readonly state = new WorkflowState()

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
    // RSS check interval: 10s with small jitter (S3 feeds update within seconds)
    private readonly rssCheckIntervalMs: number = 10_000 +
      Math.ceil(Math.random() * 2_000),
  ) {
    this.log = createServiceLogger(baseLog, 'WATCHLIST_WORKFLOW')
    this.log.info('Initializing Watchlist Workflow Service')
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

  // Rebuilt per access: fastify.config is reassigned by updateConfig at runtime
  private get deps(): WorkflowDeps {
    const logger = this.log
    const db = this.dbService
    const config = this.config
    const plexLabelSyncService = this.fastify.plexLabelSyncService

    return {
      logger,
      config,
      db,
      fastify: this.fastify,
      state: this.state,
      plexService: this.plexService,
      contentRouter: this.contentRouter,
      sonarrManager: this.sonarrManager,
      radarrManager: this.radarrManager,
      plexServerService: this.fastify.plexServerService,
      notifications: this.fastify.notifications,
      statusService: this.showStatusService,
      plexLabelSyncService,
      itemProcessorDeps: {
        db,
        logger,
        config,
        fastify: this.fastify,
        plexLabelSyncService,
        handleLinkedItemsForLabelSync: (linkItems) =>
          handleLinkedItemsForLabelSync(linkItems, {
            db,
            logger,
            plexLabelSyncService,
          }),
      },
    }
  }

  /**
   * Get the current workflow status
   *
   * @returns Current workflow status
   */
  getStatus(): WorkflowStatus {
    return this.state.status
  }

  statusEvent(): ProgressEvent {
    return systemStatusEvent(
      'watchlist-workflow-status',
      'Watchlist workflow status',
      {
        status: this.state.status,
        syncMode: this.state.isEtagFallbackActive ? 'polling' : 'rss',
        rssAvailable: !this.state.isEtagFallbackActive,
      },
    )
  }

  // intermediate starting/stopping states must reach the stream, not just final states
  private setStatus(status: WorkflowStatus): void {
    this.state.status = status
    if (this.fastify.progress.hasActiveConnections()) {
      this.fastify.progress.emit(this.statusEvent())
    }
  }

  /**
   * Get the current RSS fallback status
   * @returns boolean indicating if the service is using RSS fallback
   */
  public getIsUsingRssFallback(): boolean {
    return this.state.isEtagFallbackActive
  }

  /**
   * Get the timestamp of the last successful sync
   * @returns timestamp of the last successful sync
   */
  public getLastSuccessfulSyncTime(): number {
    return this.state.lastSuccessfulSyncTime
  }

  /**
   * Check if the workflow is fully initialized
   *
   * @returns boolean indicating if the workflow is fully initialized
   */
  isInitialized(): boolean {
    return this.state.initialized
  }

  /**
   * Check if the workflow is running in RSS mode
   *
   * @returns boolean indicating if the workflow is running in RSS mode
   */
  isRssMode(): boolean {
    return this.state.rssMode
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
      this.setStatus('starting')
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
      this.state.rssMode = result.rssMode
      this.state.isEtagFallbackActive = result.isEtagFallbackActive
      this.state.rssFeedCache = result.rssFeedCache
      this.state.deferredRoutingQueue = result.deferredRoutingQueue

      // Establish baselines BEFORE reconciliation to detect changes during sync
      // Any items added while reconciliation runs will be caught on first poll
      if (this.state.rssMode && this.state.rssFeedCache) {
        const token = this.config.plexTokens?.[0]
        if (token) {
          this.log.debug('Priming RSS caches before reconciliation')
          await this.state.rssFeedCache.primeCaches(
            this.config.selfRss,
            this.config.friendsRss,
            token,
          )
        }
      } else if (!this.state.rssMode) {
        // ETag mode: establish baselines before sync
        this.log.debug('Establishing ETag baselines before reconciliation')
        const etagPoller = this.state.ensureEtagPoller(this.config, this.log)
        const primaryUser = await this.dbService.getPrimaryUser()
        if (primaryUser) {
          const friends = await this.getEtagFriendsList()
          await etagPoller.establishAllBaselines(primaryUser.id, friends)
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
      if (this.state.rssMode) {
        // RSS mode: use RSS feeds for instant detection
        this.startRssCheck()
      } else {
        // ETag mode (fallback): use 5-minute staggered polling for change detection
        this.log.debug('Starting ETag staggered polling')
        this.startEtagCheckInterval()
      }

      // Update status to running
      this.setStatus('running')
      this.state.initialized = true

      // Log the actual mode clearly:
      // - RSS mode: RSS feeds for instant detection + 2-hour full reconciliation
      // - ETag mode: 5-min staggered ETag polling + 2-hour full reconciliation (no RSS)
      if (this.state.isEtagFallbackActive) {
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
      this.setStatus('stopped')
      this.state.initialized = false
      this.state.rssMode = false
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
    if (this.state.status !== 'running' && this.state.status !== 'starting') {
      this.log.warn(
        `Cannot stop workflow: current status is ${this.state.status}`,
      )
      return false
    }

    this.log.info('Stopping Watchlist workflow')
    this.setStatus('stopping')

    // Clear timers (service-level state)
    if (this.state.rssCheckInterval) {
      clearInterval(this.state.rssCheckInterval)
      this.state.rssCheckInterval = null
    }
    if (this.state.statusSyncDebounceTimer) {
      clearTimeout(this.state.statusSyncDebounceTimer)
      this.state.statusSyncDebounceTimer = null
    }

    // Cleanup workflow components via extracted module
    const result = await cleanupWorkflow(
      {
        etagPoller: this.state.etagPoller,
        rssFeedCache: this.state.rssFeedCache,
        deferredRoutingQueue: this.state.deferredRoutingQueue,
      },
      {
        logger: this.log,
        cleanupExistingManualSync: () => this.cleanupExistingManualSync(),
      },
    )

    // Apply cleanup results
    this.state.rssFeedCache = result.rssFeedCache
    this.state.deferredRoutingQueue = result.deferredRoutingQueue

    // Update status
    this.setStatus('stopped')
    this.state.initialized = false
    this.state.rssMode = false

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
    return reconcileModule(options, this.deps)
  }

  /**
   * Route pre-enriched, already-saved items for a user.
   * Delegates to extracted routing module.
   */
  private async routeEnrichedItemsForUser(
    userId: number,
    items: Item[],
  ): Promise<void> {
    return routeEnrichedItemsForUserModule(userId, items, this.deps)
  }

  /**
   * Route new items for a specific user detected via change detection.
   * Delegates to extracted routing module.
   */
  private async routeNewItemsForUser(change: EtagPollResult): Promise<void> {
    return routeNewItemsForUserModule(change, this.deps)
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
    const etagPoller = this.state.ensureEtagPoller(this.config, this.log)

    const primaryUser = await this.dbService.getPrimaryUser()
    if (!primaryUser) {
      this.log.warn('No primary user found, cannot start staggered polling')
      return
    }

    // Get initial friends list
    const friends = await this.getEtagFriendsList()

    // Start staggered polling with callbacks
    etagPoller.startStaggeredPolling(
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
    return handleStaggeredPollResult(result, this.deps)
  }

  /**
   * Refresh friends list at the start of each staggered polling cycle.
   */
  private async refreshFriendsForStaggeredPolling(): Promise<EtagUserInfo[]> {
    return refreshFriendsForStaggeredPollingModule(this.deps)
  }

  /**
   * Get friends list formatted for EtagPoller.
   */
  private async getEtagFriendsList(): Promise<EtagUserInfo[]> {
    return getEtagFriendsList(this.deps)
  }

  /**
   * Schedule a debounced syncAllStatuses call after routing.
   */
  private scheduleDebouncedStatusSync(): void {
    this.state.scheduleDebouncedStatusSync(this.deps)
  }

  /**
   * Fetch all watchlists (self and friends)
   */
  async fetchWatchlists(): Promise<void> {
    return fetchWatchlistsModule(this.deps)
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
    if (this.state.rssCheckInterval) {
      clearInterval(this.state.rssCheckInterval)
    }

    this.state.rssCheckInterval = setInterval(async () => {
      try {
        if (!this.state.rssFeedCache) {
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
          const selfResult = await this.state.rssFeedCache.checkSelfFeed(
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
          const friendsResult = await this.state.rssFeedCache.checkFriendsFeed(
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
    return processRssSelfItemsModule(items, this.deps)
  }

  /**
   * Process new items from friends RSS feed.
   */
  private async processRssFriendsItems(items: CachedRssItem[]): Promise<void> {
    return processRssFriendsItemsModule(items, this.deps)
  }

  private async setupPeriodicReconciliation(): Promise<void> {
    try {
      // Create the periodic job with simple sync logic - no conditional checks
      await this.fastify.scheduler.scheduleJob(
        RECONCILIATION_JOB_NAME,
        async (_jobName: string) => {
          try {
            // Skip if workflow is not running
            if (this.state.status !== 'running') {
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
              // Perform full reconciliation (this also re-establishes baselines)
              // Note: Change detection (RSS or ETag) continues during reconciliation
              // to catch new items - deduplication handles any overlap
              await this.reconcile({ mode: 'full' })

              // Update timing trackers
              this.state.lastSuccessfulSyncTime = Date.now()

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
    return cleanupExistingManualSync(this.deps)
  }

  /**
   * Updates auto-approval records that were created with System user (ID: 0)
   * to attribute them to the actual users who added the content to their watchlists.
   */
  private async updateAutoApprovalUserAttribution(): Promise<void> {
    return updateAutoApprovalUserAttribution(this.deps)
  }

  /**
   * Schedule the next periodic reconciliation to run in 2 hours.
   */
  private async schedulePendingReconciliation(): Promise<void> {
    return schedulePendingReconciliation(this.deps)
  }

  /**
   * Cancel any pending periodic reconciliation job
   */
  private async unschedulePendingReconciliation(): Promise<void> {
    return unschedulePendingReconciliation(this.deps)
  }
}
