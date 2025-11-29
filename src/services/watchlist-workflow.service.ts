/**
 * Watchlist Workflow Service
 *
 * Handles the synchronization between Plex watchlists and Sonarr/Radarr using a
 * hybrid RSS + ETag approach for efficient change detection and instant routing.
 *
 * Architecture:
 * - RSS feeds detect "something changed" (subject to 24h Cloudflare cache)
 * - ETag polling identifies WHO changed and WHAT was added
 * - New items are routed instantly with full user context (no deferral needed)
 * - 3-minute ETag interval serves as fallback for cached RSS
 *
 * Responsible for:
 * - Monitoring Plex watchlists via RSS feeds for change detection
 * - Using ETag-based polling to identify specific user changes
 * - Routing new items instantly to Sonarr/Radarr via content router
 * - Coordinating with other services (PlexWatchlist, SonarrManager, RadarrManager)
 * - Supporting user sync settings and approval workflows
 * - Periodic full reconciliation as a failsafe
 *
 * @example
 * // Starting the workflow in a Fastify plugin:
 * fastify.decorate('watchlistWorkflow', new WatchlistWorkflowService(log, fastify));
 * await fastify.watchlistWorkflow.startWorkflow();
 */

import type {
  Item as DbWatchlistItem,
  EtagPollResult,
  EtagUserInfo,
  RssWatchlistResults,
  TemptRssWatchlistItem,
  TokenWatchlistItem,
  WatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type {
  Condition,
  ConditionGroup,
  RoutingContext,
} from '@root/types/router.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  extractTmdbId,
  extractTvdbId,
  getGuidMatchScore,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { EtagPoller, toItemsSingle } from '@utils/plex/index.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import pLimit from 'p-limit'

/** Represents the current state of the watchlist workflow */
type WorkflowStatus = 'stopped' | 'running' | 'starting' | 'stopping'

export class WatchlistWorkflowService {
  private readonly MANUAL_SYNC_JOB_NAME = 'periodic-watchlist-reconciliation'
  /** Current workflow status */
  private status: WorkflowStatus = 'stopped'
  /** Creates a fresh service logger that inherits current log level */
  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'WATCHLIST_WORKFLOW')
  }

  /** Tracks if the workflow is fully initialized */
  private initialized = false

  /** Tracks if the workflow is running in RSS mode */
  private rssMode = false

  /** Interval timer for checking RSS feeds */
  private rssCheckInterval: NodeJS.Timeout | null = null

  /** Previous snapshot of self-watchlist items for change detection */
  private previousSelfItems: Map<string, WatchlistItem> = new Map()

  /** Previous snapshot of friends-watchlist items for change detection */
  private previousFriendsItems: Map<string, WatchlistItem> = new Map()

  /** Flag to track if first self feed has been processed */
  private hasProcessedInitialFeed: { self: boolean; friends: boolean } = {
    self: false,
    friends: false,
  }

  /** Flag to indicate if using RSS fallback */
  private isUsingRssFallback = false

  /** Timestamp of the last successful watchlist sync */
  private lastSuccessfulSyncTime: number = Date.now()

  /** ETag poller for hybrid RSS + ETag change detection */
  private etagPoller: EtagPoller | null = null

  /** Interval timer for ETag checks (fallback for cached RSS) */
  private etagCheckInterval: NodeJS.Timeout | null = null

  /** ETag check interval in ms (3 minutes) */
  private readonly ETAG_CHECK_INTERVAL_MS = 3 * 60 * 1000

  /** Debounce timer for syncAllStatuses after ETag routing */
  private statusSyncDebounceTimer: NodeJS.Timeout | null = null

  /** Debounce delay for status sync in ms (1 minute) */
  private readonly STATUS_SYNC_DEBOUNCE_MS = 60 * 1000

  /**
   * Creates a new WatchlistWorkflowService instance
   *
   * @param log - Fastify logger instance for recording workflow operations
   * @param fastify - Fastify instance for accessing other services
   * @param rssCheckIntervalMs - Interval in ms between RSS feed checks
   */
  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly rssCheckIntervalMs: number = 10000,
  ) {
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
    return this.isUsingRssFallback
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

      // Clean up any existing manual sync jobs from previous runs
      try {
        this.log.debug('Cleaning up existing manual sync jobs')
        await this.cleanupExistingManualSync()
      } catch (cleanupError) {
        this.log.warn(
          { error: cleanupError },
          'Error during cleanup of existing manual sync jobs (non-fatal)',
        )
        // Continue despite this error
      }

      // Verify Plex connectivity
      try {
        this.log.debug('Verifying Plex connectivity')
        await this.plexService.pingPlex()
        this.log.info('Plex connection verified')
      } catch (plexError) {
        this.log.error(
          { error: plexError },
          'Failed to verify Plex connectivity',
        )
        throw new Error('Failed to verify Plex connectivity', {
          cause: plexError,
        })
      }

      // Try to generate RSS feeds first
      try {
        this.log.debug('Generating RSS feeds')
        const rssFeeds = await this.plexService.generateAndSaveRssFeeds()

        if ('error' in rssFeeds) {
          this.log.warn(
            { error: rssFeeds.error },
            'Failed to generate RSS feeds, falling back to manual sync',
          )
          this.isUsingRssFallback = true
          this.rssMode = false
        } else {
          // Initialize RSS monitoring if feeds were generated successfully
          this.log.debug(
            'RSS feeds generated successfully, initializing monitoring',
          )
          await this.initializeRssSnapshots()
          this.startRssCheck()
          this.isUsingRssFallback = false
          this.rssMode = true
        }
      } catch (rssError) {
        this.log.error(
          { error: rssError },
          'Error generating or initializing RSS feeds',
        )
        throw new Error('Failed to generate or initialize RSS feeds', {
          cause: rssError,
        })
      }

      // Set up periodic reconciliation job regardless of RSS mode
      try {
        this.log.debug('Setting up periodic reconciliation job')
        await this.setupPeriodicReconciliation()
      } catch (reconciliationError) {
        this.log.warn(
          {
            error: reconciliationError,
          },
          'Failed to setup periodic reconciliation',
        )
        // Continue despite this error
      }

      // Initial full reconciliation - syncs all users, establishes ETag baselines
      try {
        this.log.debug('Starting initial full reconciliation')
        await this.reconcile({ mode: 'full' })

        // Schedule first periodic reconciliation for +20 minutes
        await this.schedulePendingReconciliation()
      } catch (syncError) {
        this.log.error(
          {
            error: syncError,
            errorMessage:
              syncError instanceof Error
                ? syncError.message
                : String(syncError),
            errorStack:
              syncError instanceof Error ? syncError.stack : undefined,
          },
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

      // Start 3-minute ETag check interval (fallback for 24h RSS cache)
      this.log.debug('Starting ETag check interval')
      this.startEtagCheckInterval()

      // Update status to running after everything is initialized
      this.status = 'running'
      this.initialized = true

      // Set the RSS mode flag based on whether we're using RSS fallback
      this.rssMode = !this.isUsingRssFallback

      this.log.info(
        `Watchlist workflow running in ${this.isUsingRssFallback ? 'periodic reconciliation' : 'RSS'} mode with periodic reconciliation and 3-minute ETag checks`,
      )

      return true
    } catch (error) {
      this.status = 'stopped'
      this.initialized = false
      this.rssMode = false

      // Enhanced error logging
      this.log.error(
        {
          error,
          errorDetails:
            error instanceof Error
              ? {
                  message: error.message,
                  name: error.name,
                  stack: error.stack,
                  cause: error.cause,
                }
              : undefined,
        },
        'Error in Watchlist workflow',
      )

      throw error
    }
  }

  /**
   * Stop the watchlist workflow
   *
   * Clears all intervals and resets the workflow state.
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

    // Clear RSS check interval
    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
      this.rssCheckInterval = null
    }

    // Clean up periodic reconciliation job regardless of mode
    try {
      await this.cleanupExistingManualSync()
    } catch (error) {
      this.log.error(
        { error },
        'Error cleaning up periodic reconciliation during shutdown',
      )
    }

    // Clear ETag check interval
    if (this.etagCheckInterval) {
      clearInterval(this.etagCheckInterval)
      this.etagCheckInterval = null
    }

    // Clear status sync debounce timer
    if (this.statusSyncDebounceTimer) {
      clearTimeout(this.statusSyncDebounceTimer)
      this.statusSyncDebounceTimer = null
    }

    // Clear ETag cache
    if (this.etagPoller) {
      this.etagPoller.clearCache()
    }

    // Update status
    this.status = 'stopped'
    this.initialized = false
    this.rssMode = false

    return true
  }

  // ============================================================================
  // Hybrid RSS + ETag Reconciliation
  // ============================================================================

  /**
   * Unified reconciliation entry point for hybrid RSS + ETag sync.
   *
   * @param options.mode - 'full' for complete sync, 'etag' for lightweight ETag-based check
   *
   * Full mode (startup, manual refresh):
   * - Syncs all users, all items
   * - Establishes ETag baselines
   *
   * ETag mode (5-min interval, RSS trigger):
   * - Checks friend changes (add/remove)
   * - Checks ETags for all users
   * - Only syncs users with changes (instant routing of new items)
   */
  async reconcile(options: { mode: 'full' | 'etag' }): Promise<void> {
    // Ensure ETag poller is initialized
    if (!this.etagPoller) {
      this.etagPoller = new EtagPoller(this.config, this.log)
    }

    // Get primary user for ETag operations
    const primaryUser = await this.dbService.getPrimaryUser()
    if (!primaryUser) {
      this.log.warn('No primary user found, cannot reconcile')
      return
    }

    // Check friend changes ALWAYS (regardless of mode)
    const friendChanges = await this.plexService.checkFriendChanges()

    // Handle newly added friends immediately
    for (const newFriend of friendChanges.added) {
      this.log.info(
        { userId: newFriend.userId, username: newFriend.username },
        'New friend detected, establishing baseline and syncing',
      )
      await this.etagPoller.establishBaseline(newFriend)
      // Initial items for new friend will be fetched during full sync or next ETag check
    }

    // Handle removed friends - invalidate their ETag cache
    for (const removedFriend of friendChanges.removed) {
      this.log.info(
        { userId: removedFriend.userId, username: removedFriend.username },
        'Friend removed, invalidating ETag cache',
      )
      this.etagPoller.invalidateUser(
        removedFriend.userId,
        removedFriend.watchlistId,
      )
    }

    // Build EtagUserInfo array for current friends
    const friends = this.buildEtagUserInfoFromMap(friendChanges.userMap)

    if (options.mode === 'full') {
      // Full sync - existing behavior
      this.log.info('Starting full reconciliation')
      await this.fetchWatchlists()
      await this.syncWatchlistItems()

      // Establish ETag baselines for all users after full sync
      await this.etagPoller.establishAllBaselines(primaryUser.id, friends)

      this.lastSuccessfulSyncTime = Date.now()
      this.log.info('Full reconciliation completed')
    } else {
      // ETag mode - lightweight check with instant routing
      this.log.debug('Starting ETag-based reconciliation')

      const changes = await this.etagPoller.checkAllEtags(
        primaryUser.id,
        friends,
      )

      if (changes.length === 0) {
        this.log.debug('ETag check: no changes detected, exiting early')
        return
      }

      // Process changes for each user with new items
      const changesWithNewItems = changes.filter(
        (c) => c.changed && c.newItems.length > 0,
      )

      if (changesWithNewItems.length > 0) {
        this.log.info(
          {
            userCount: changesWithNewItems.length,
            totalNewItems: changesWithNewItems.reduce(
              (sum, c) => sum + c.newItems.length,
              0,
            ),
          },
          'ETag check detected new items, routing instantly',
        )

        for (const change of changesWithNewItems) {
          await this.routeNewItemsForUser(change)
        }

        // Post-routing tasks - call with no args to process System user attributions
        // Note: This may be removable for ETag path since we have user context,
        // but keeping as a safety net for edge cases
        await this.updateAutoApprovalUserAttribution()

        // Schedule debounced status sync after routing new content
        // This batches multiple rapid routing operations (e.g., user adds several items quickly)
        this.scheduleDebouncedStatusSync()
      }

      this.lastSuccessfulSyncTime = Date.now()
      this.log.debug('ETag-based reconciliation completed')
    }
  }

  /**
   * Route new items for a specific user detected via ETag polling.
   * This is the "instant routing" path - no deferral needed since we know
   * exactly WHO added WHAT.
   *
   * Flow:
   * 1. Check user sync settings
   * 2. Enrich each item via Plex API to get GUIDs, genres, thumb
   * 3. Check for required IDs (TVDB for shows, TMDB for movies)
   * 4. Check existence in target instances
   * 5. Check Plex existence (if enabled)
   * 6. Route via content router
   * 7. Send notifications
   */
  private async routeNewItemsForUser(change: EtagPollResult): Promise<void> {
    const { userId, newItems } = change

    if (newItems.length === 0) return

    // Get user info for routing context
    const user = await this.dbService.getUser(userId)
    if (!user) {
      this.log.warn({ userId }, 'User not found for routing new items')
      return
    }

    // Check if user has sync enabled
    if (!user.can_sync) {
      this.log.debug(
        { userId, username: user.name, itemCount: newItems.length },
        'Skipping items for user with sync disabled',
      )
      return
    }

    this.log.info(
      { userId, username: user.name, itemCount: newItems.length },
      'Routing new items for user',
    )

    // Fetch primary user for Plex existence checks
    const primaryUser = await this.dbService.getPrimaryUser()

    // Process each new item: enrich then route
    // Note: Existence checks use single-item API lookup (routing-aware) instead of
    // bulk fetching all content - more efficient for the small batches typical of ETag routing
    for (const etagItem of newItems) {
      try {
        // Convert EtagPollItem to TokenWatchlistItem for enrichment
        const tokenItem: TokenWatchlistItem = {
          id: etagItem.id,
          title: etagItem.title,
          type: etagItem.type.toLowerCase(),
          user_id: userId,
          status: 'pending',
          key: etagItem.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        // Enrich item via Plex API to get GUIDs, genres, thumb
        const enrichedItems = await toItemsSingle(
          this.config,
          this.log,
          tokenItem,
        )

        if (enrichedItems.size === 0) {
          this.log.warn(
            { userId, itemId: etagItem.id, title: etagItem.title },
            'Failed to enrich item - skipping routing',
          )
          continue
        }

        // Get the enriched item
        const enrichedItem = [...enrichedItems][0]

        // Parse GUIDs (handles string | string[] | undefined)
        const parsedGuids = parseGuids(enrichedItem.guids)

        // Skip if no GUIDs after enrichment
        if (parsedGuids.length === 0) {
          this.log.warn(
            { userId, itemId: etagItem.id, title: etagItem.title },
            'Item has no GUIDs after enrichment - skipping routing',
          )
          continue
        }

        // Parse genres (handles string | string[] | undefined)
        const parsedGenres = parseGenres(enrichedItem.genres)

        // Normalize type to 'movie' | 'show'
        const normalizedType = enrichedItem.type.toLowerCase()

        // Build temp item for routing helpers
        const tempItem: TemptRssWatchlistItem = {
          title: enrichedItem.title,
          key: enrichedItem.key,
          type: normalizedType,
          thumb: enrichedItem.thumb,
          guids: parsedGuids,
          genres: parsedGenres,
        }

        // Save to watchlist_items table (same as full sync does)
        // Use DbWatchlistItem (Item type) which matches createWatchlistItems signature
        const dbItem: Omit<DbWatchlistItem, 'created_at' | 'updated_at'> = {
          user_id: userId,
          title: enrichedItem.title,
          key: enrichedItem.key,
          type: normalizedType,
          thumb: enrichedItem.thumb, // Optional in DbWatchlistItem
          guids: parsedGuids,
          genres: parsedGenres,
          status: 'pending' as const,
        }

        const insertedResults = await this.dbService.createWatchlistItems(
          [dbItem],
          { onConflict: 'ignore' }, // Don't overwrite if already exists
        )

        // Sync genres from the newly added item
        await this.dbService.syncGenresFromWatchlist()

        // Trigger Plex label sync for newly inserted items if enabled
        if (
          this.fastify.plexLabelSyncService &&
          this.config.plexLabelSync?.enabled &&
          insertedResults &&
          insertedResults.length > 0
        ) {
          try {
            for (const { id } of insertedResults) {
              await this.fastify.plexLabelSyncService.syncLabelForNewWatchlistItem(
                id,
                dbItem.title,
                true, // Enable tag fetching
              )
            }
          } catch (labelError) {
            this.log.warn(
              { error: labelError, title: enrichedItem.title },
              'Error syncing Plex labels for new item (non-fatal)',
            )
          }
        }

        // Route based on content type using existing helper methods
        // These handle existence checks, Plex checks, and notifications
        if (normalizedType === 'show') {
          // Check for TVDB ID
          const tvdbId = extractTvdbId(parsedGuids)
          if (tvdbId === 0) {
            this.log.warn(
              { userId, title: enrichedItem.title, guids: parsedGuids },
              'Show has no valid TVDB ID - skipping routing',
            )
            continue
          }

          const sonarrItem: SonarrItem = {
            title: enrichedItem.title,
            guids: parsedGuids,
            type: 'show',
            ended: false,
            genres: parsedGenres,
            status: 'pending',
            series_status: 'continuing',
          }

          await this.processShowWithRouting({
            tempItem,
            numericUserId: userId,
            userName: user.name,
            sonarrItem,
            primaryUser,
          })
        } else if (normalizedType === 'movie') {
          // Check for TMDB ID
          const tmdbId = extractTmdbId(parsedGuids)
          if (tmdbId === 0) {
            this.log.warn(
              { userId, title: enrichedItem.title, guids: parsedGuids },
              'Movie has no valid TMDB ID - skipping routing',
            )
            continue
          }

          const radarrItem: RadarrItem = {
            title: enrichedItem.title,
            guids: parsedGuids,
            type: 'movie',
            genres: parsedGenres,
          }

          await this.processMovieWithRouting({
            tempItem,
            numericUserId: userId,
            userName: user.name,
            radarrItem,
            primaryUser,
          })
        }

        this.log.debug(
          { userId, title: enrichedItem.title, type: normalizedType },
          'Successfully processed new item',
        )
      } catch (error) {
        this.log.error(
          { error, userId, itemId: etagItem.id, title: etagItem.title },
          'Error routing new item',
        )
      }
    }
  }

  /**
   * Build EtagUserInfo array from the userMap returned by checkFriendChanges.
   * Needs to include watchlistId for each friend.
   */
  private buildEtagUserInfoFromMap(
    userMap: Map<string, number>,
  ): EtagUserInfo[] {
    const friends: EtagUserInfo[] = []

    for (const [watchlistId, userId] of userMap) {
      friends.push({
        userId,
        username: '', // We don't have username here, but EtagPoller uses watchlistId
        watchlistId,
        isPrimary: false,
      })
    }

    return friends
  }

  /**
   * Start the 3-minute ETag check interval.
   * This serves as a fallback when RSS is cached (24h Cloudflare cache).
   */
  private startEtagCheckInterval(): void {
    if (this.etagCheckInterval) {
      clearInterval(this.etagCheckInterval)
    }

    this.log.info(
      { intervalMinutes: this.ETAG_CHECK_INTERVAL_MS / 60000 },
      'Starting ETag check interval',
    )

    this.etagCheckInterval = setInterval(async () => {
      try {
        await this.reconcile({ mode: 'etag' })
      } catch (error) {
        this.log.error({ error }, 'Error in ETag check interval')
      }
    }, this.ETAG_CHECK_INTERVAL_MS)
  }

  /**
   * Reset the 3-minute ETag check interval.
   * Called when RSS triggers an ETag check to avoid redundant checks.
   */
  private resetEtagCheckInterval(): void {
    if (this.etagCheckInterval) {
      clearInterval(this.etagCheckInterval)
      this.etagCheckInterval = setInterval(async () => {
        try {
          await this.reconcile({ mode: 'etag' })
        } catch (error) {
          this.log.error({ error }, 'Error in ETag check interval')
        }
      }, this.ETAG_CHECK_INTERVAL_MS)
      this.log.debug('Reset ETag check interval after RSS-triggered check')
    }
  }

  /**
   * Schedule a debounced syncAllStatuses call after ETag routing.
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
   *
   * Refreshes the local copy of watchlists and updates show/movie statuses.
   * Self and friend watchlists are fetched in parallel to improve performance.
   */
  async fetchWatchlists(): Promise<void> {
    this.log.info('Refreshing watchlists')

    // Unschedule pending reconciliation since sync is starting
    await this.unschedulePendingReconciliation()

    try {
      // Fetch both self and friends watchlists in parallel
      const fetchResults = await Promise.allSettled([
        // Self watchlist promise
        (async () => {
          try {
            this.log.debug('Fetching self watchlist')
            return await this.plexService.getSelfWatchlist()
          } catch (selfError) {
            this.log.error(
              {
                error: selfError,
                errorMessage:
                  selfError instanceof Error
                    ? selfError.message
                    : String(selfError),
                errorStack:
                  selfError instanceof Error ? selfError.stack : undefined,
              },
              'Error refreshing self watchlist',
            )
            throw new Error('Failed to refresh self watchlist', {
              cause: selfError,
            })
          }
        })(),

        // Friends watchlist promise
        (async () => {
          try {
            this.log.debug('Fetching friends watchlists')
            return await this.plexService.getOthersWatchlists()
          } catch (friendsError) {
            this.log.error(
              {
                error: friendsError,
                errorMessage:
                  friendsError instanceof Error
                    ? friendsError.message
                    : String(friendsError),
                errorStack:
                  friendsError instanceof Error
                    ? friendsError.stack
                    : undefined,
              },
              'Error refreshing friends watchlists',
            )
            throw new Error('Failed to refresh friends watchlists', {
              cause: friendsError,
            })
          }
        })(),
      ])

      // Check for any failures
      const selfResult = fetchResults[0]
      const friendsResult = fetchResults[1]

      if (selfResult.status === 'rejected') {
        throw selfResult.reason
      }

      if (friendsResult.status === 'rejected') {
        throw friendsResult.reason
      }

      this.log.info('Watchlists refreshed successfully')
    } catch (error) {
      this.log.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Error refreshing watchlists',
      )
      throw error
    }
  }

  /**
   * Initialize RSS feed snapshots
   *
   * Creates initial maps of items from both self and friends RSS feeds
   * to enable change detection on subsequent checks.
   */
  private async initializeRssSnapshots(): Promise<void> {
    this.log.info('Initializing RSS snapshots')

    const results = await this.plexService.processRssWatchlists()

    // Process self watchlist
    if (results.self.users[0]?.watchlist) {
      this.previousSelfItems = this.createItemMap(
        results.self.users[0].watchlist,
      )
      this.log.debug(
        {
          itemCount: this.previousSelfItems.size,
        },
        'Initialized self RSS feed snapshot',
      )
    }

    // Process friends watchlist
    if (results.friends.users[0]?.watchlist) {
      this.previousFriendsItems = this.createItemMap(
        results.friends.users[0].watchlist,
      )
      this.log.debug(
        {
          itemCount: this.previousFriendsItems.size,
        },
        'Initialized friends RSS feed snapshot',
      )
    }
  }

  /**
   * Create a map of watchlist items keyed by their first GUID
   *
   * @param items - Array of watchlist items
   * @returns Map of items keyed by their first GUID
   */
  private createItemMap(items: WatchlistItem[]): Map<string, WatchlistItem> {
    const itemMap = new Map<string, WatchlistItem>()

    for (const item of items) {
      const guids = parseGuids(item.guids)
      if (guids.length > 0) {
        itemMap.set(guids[0], item)
      }
    }

    return itemMap
  }

  /**
   * Start the RSS check interval
   *
   * Sets up periodic checking of RSS feeds for changes.
   */
  private startRssCheck(): void {
    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
    }

    this.rssCheckInterval = setInterval(async () => {
      try {
        const results = await this.plexService.processRssWatchlists()
        await this.processRssResults(results)
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
   * Process results from RSS feed checks
   *
   * Detects changes in both self and friends feeds. When changes are detected,
   * triggers ETag-based reconciliation to identify WHO changed and route instantly.
   *
   * @param results - RSS watchlist results containing both self and friends data
   */
  private async processRssResults(results: RssWatchlistResults): Promise<void> {
    let selfChanged = false
    let friendsChanged = false

    // Process self RSS feed
    if (results.self.users[0]?.watchlist) {
      const currentWatchlist = results.self.users[0].watchlist
      const isFeedEmpty = currentWatchlist.length === 0

      if (isFeedEmpty) {
        this.log.warn('Self RSS feed is empty, skipping self feed processing')
      } else {
        // Check if previous state was empty or not yet initialized
        if (this.previousSelfItems.size === 0) {
          this.log.info(
            `First valid self RSS feed received with ${currentWatchlist.length} items, establishing baseline`,
          )
          this.previousSelfItems = this.createItemMap(currentWatchlist)

          // If this is the first time we're seeing content, mark as changed to trigger reconcile
          if (this.hasProcessedInitialFeed.self === false) {
            this.log.info(
              'First valid self feed - will trigger ETag reconciliation',
            )
            selfChanged = true
            this.hasProcessedInitialFeed.self = true
          }
        } else {
          // Both current and previous feeds are valid, proceed with normal change detection
          const currentItems = this.createItemMap(currentWatchlist)
          const changes = this.detectChanges(
            this.previousSelfItems,
            currentItems,
          )
          if (changes.size > 0) {
            this.log.debug(
              { changeCount: changes.size },
              'Self RSS feed detected changes',
            )
            selfChanged = true
          }
          this.previousSelfItems = currentItems
        }
      }
    }

    // Process friends RSS feed
    if (results.friends.users[0]?.watchlist) {
      const currentWatchlist = results.friends.users[0].watchlist
      const isFeedEmpty = currentWatchlist.length === 0

      if (isFeedEmpty) {
        this.log.warn(
          'Friends RSS feed is empty, skipping friends feed processing',
        )
      } else {
        // Check if previous state was empty or not yet initialized
        if (this.previousFriendsItems.size === 0) {
          this.log.info(
            `First valid friends RSS feed received with ${currentWatchlist.length} items, establishing baseline`,
          )
          this.previousFriendsItems = this.createItemMap(currentWatchlist)

          // If this is the first time we're seeing content, mark as changed to trigger reconcile
          if (this.hasProcessedInitialFeed.friends === false) {
            this.log.info(
              'First valid friends feed - will trigger ETag reconciliation',
            )
            friendsChanged = true
            this.hasProcessedInitialFeed.friends = true
          }
        } else {
          // Both current and previous feeds are valid, proceed with normal change detection
          const currentItems = this.createItemMap(currentWatchlist)
          const changes = this.detectChanges(
            this.previousFriendsItems,
            currentItems,
          )
          if (changes.size > 0) {
            this.log.debug(
              { changeCount: changes.size },
              'Friends RSS feed detected changes',
            )
            friendsChanged = true
          }
          this.previousFriendsItems = currentItems
        }
      }
    }

    // If any changes detected, trigger ETag-based reconciliation
    // This identifies WHO changed and routes new items instantly
    if (selfChanged || friendsChanged) {
      this.log.info(
        { selfChanged, friendsChanged },
        'RSS detected changes - triggering ETag reconciliation',
      )
      try {
        await this.reconcile({ mode: 'etag' })
        // Reset the 3-minute interval since we just did an ETag check
        this.resetEtagCheckInterval()
      } catch (error) {
        this.log.error(
          { error },
          'Error during RSS-triggered ETag reconciliation',
        )
      }
    }
  }

  /**
   * Detect changes between previous and current RSS feed items
   *
   * Compares two maps of watchlist items to identify additions, removals, and modifications.
   *
   * @param previousItems - Map of previous watchlist items
   * @param currentItems - Map of current watchlist items
   * @returns Set of changed items requiring processing
   */
  private detectChanges(
    previousItems: Map<string, WatchlistItem>,
    currentItems: Map<string, WatchlistItem>,
  ): Set<TemptRssWatchlistItem> {
    const changes = new Set<TemptRssWatchlistItem>()

    // Check for new or modified items
    currentItems.forEach((currentItem, guid) => {
      const previousItem = previousItems.get(guid)

      if (!previousItem) {
        // New item
        this.log.debug(
          { guid, title: currentItem.title },
          'New item detected in RSS feed',
        )
        changes.add(this.convertToTempItem(currentItem))
      } else {
        const hasChanged =
          previousItem.title !== currentItem.title ||
          previousItem.type !== currentItem.type ||
          previousItem.thumb !== currentItem.thumb ||
          !this.arraysEqualIgnoreOrder(
            parseGenres(previousItem.genres),
            parseGenres(currentItem.genres),
          )

        if (hasChanged) {
          this.log.debug(
            {
              guid,
              title: currentItem.title,
              changes: {
                title: previousItem.title !== currentItem.title,
                type: previousItem.type !== currentItem.type,
                thumb: previousItem.thumb !== currentItem.thumb,
                genres: !this.arraysEqualIgnoreOrder(
                  parseGenres(previousItem.genres),
                  parseGenres(currentItem.genres),
                ),
              },
            },
            'Item metadata changed in RSS feed',
          )
          changes.add(this.convertToTempItem(currentItem))
        }
      }
    })

    // Check for removed items (for logging purposes)
    previousItems.forEach((item, guid) => {
      if (!currentItems.has(guid)) {
        this.log.debug(
          { guid, title: item.title },
          'Item removed from RSS feed',
        )
      }
    })

    // Log summary if changes were detected
    if (changes.size > 0) {
      this.log.info(
        {
          changedItemsCount: changes.size,
          previousItemsCount: previousItems.size,
          currentItemsCount: currentItems.size,
        },
        'RSS feed changes detected',
      )
    }

    return changes
  }

  /**
   * Convert a watchlist item to the temporary format used for processing
   *
   * @param item - Watchlist item from RSS feed
   * @returns Temporary format watchlist item
   */
  private convertToTempItem(item: WatchlistItem): TemptRssWatchlistItem {
    return {
      title: item.title,
      type: typeof item.type === 'string' ? item.type.toLowerCase() : item.type,
      thumb: item.thumb,
      guids: parseGuids(item.guids),
      genres: item.genres,
      key: item.plexKey,
    }
  }

  /**
   * Synchronize watchlist items between Plex, Sonarr, and Radarr
   *
   * Processes all watchlist items, respecting user sync settings,
   * and ensures items are correctly routed to the appropriate instances.
   */
  private async syncWatchlistItems(): Promise<void> {
    this.log.info('Performing watchlist item sync')

    try {
      // Clear Plex resources cache to ensure fresh data for this reconciliation cycle
      this.fastify.plexServerService.clearPlexResourcesCache()

      // Clear content availability cache for this reconciliation cycle
      // This is reconciliation-scoped - cache is rebuilt fresh each cycle
      this.fastify.plexServerService.clearContentCacheForReconciliation()

      // Check health of all Sonarr/Radarr instances before proceeding
      // If all instances are unavailable, abort to prevent false approval creation
      const [sonarrHealth, radarrHealth] = await Promise.all([
        this.sonarrManager.checkInstancesHealth(),
        this.radarrManager.checkInstancesHealth(),
      ])

      const totalAvailable =
        sonarrHealth.available.length + radarrHealth.available.length
      const totalConfigured =
        sonarrHealth.available.length +
        sonarrHealth.unavailable.length +
        radarrHealth.available.length +
        radarrHealth.unavailable.length

      if (totalConfigured === 0) {
        this.log.debug(
          'No Radarr/Sonarr instances configured, skipping reconciliation',
        )
        return
      }

      if (totalConfigured > 0 && totalAvailable === 0) {
        this.log.error(
          'All Radarr/Sonarr instances are unavailable, aborting reconciliation to prevent false approval creation',
        )
        return
      }

      // Warn if some instances are unavailable (partial data)
      if (
        sonarrHealth.unavailable.length > 0 ||
        radarrHealth.unavailable.length > 0
      ) {
        this.log.warn(
          {
            sonarrAvailable: sonarrHealth.available.length,
            sonarrUnavailable: sonarrHealth.unavailable.length,
            radarrAvailable: radarrHealth.available.length,
            radarrUnavailable: radarrHealth.unavailable.length,
          },
          'Some instances unavailable during reconciliation - proceeding with available instances only',
        )
      }

      // Get all users to check their sync permissions
      const allUsers = await this.dbService.getAllUsers()
      const userSyncStatus = new Map<number, boolean>()
      const userById = new Map<number, (typeof allUsers)[number]>()

      // Create maps for user sync status and user objects for quick lookups (avoids N+1 queries)
      for (const user of allUsers) {
        userSyncStatus.set(user.id, user.can_sync !== false)
        userById.set(user.id, user)
      }

      // Fetch primary user once to avoid N+1 queries during item processing
      const primaryUser = await this.dbService.getPrimaryUser()

      // DEBUG: Log user sync settings
      for (const [userId, canSync] of userSyncStatus.entries()) {
        this.log.debug(`User ${userId} can_sync setting: ${canSync}`)
      }

      // Get all shows and movies from watchlists
      const [shows, movies] = await Promise.all([
        this.dbService.getAllShowWatchlistItems(),
        this.dbService.getAllMovieWatchlistItems(),
      ])
      const allWatchlistItems = [...shows, ...movies]

      // Get all existing series and movies from Sonarr/Radarr
      // Each instance's bypassIgnored setting determines if exclusions are included
      const [existingSeries, existingMovies] = await Promise.all([
        this.sonarrManager.fetchAllSeries(),
        this.radarrManager.fetchAllMovies(),
      ])

      // Statistics tracking
      let showsAdded = 0
      let moviesAdded = 0
      let unmatchedShows = 0
      let unmatchedMovies = 0
      let skippedDueToUserSetting = 0
      let skippedDueToMissingIds = 0
      const skippedItems: { shows: string[]; movies: string[] } = {
        shows: [],
        movies: [],
      }

      // Create a set of all watchlist GUIDs for fast lookup
      const watchlistGuids = new Set(
        allWatchlistItems.flatMap((item) => parseGuids(item.guids)),
      )

      // Check unmatched items in Sonarr/Radarr (for reporting purposes)
      for (const series of existingSeries) {
        const hasMatch = series.guids.some((guid) => watchlistGuids.has(guid))
        if (!hasMatch) {
          unmatchedShows++
          this.log.debug(
            {
              title: series.title,
              guids: series.guids,
            },
            'Sonarr series not matched to any watchlist item',
          )
        }
      }

      for (const movie of existingMovies) {
        const hasMatch = movie.guids.some((guid) => watchlistGuids.has(guid))
        if (!hasMatch) {
          unmatchedMovies++
          this.log.debug(
            {
              title: movie.title,
              guids: movie.guids,
            },
            'Radarr movie not matched to any watchlist item',
          )
        }
      }

      // Process watchlist items with rate limiting to prevent overwhelming Plex
      // Use same concurrency pattern as label sync service
      const concurrencyLimit =
        this.fastify.config.plexLabelSync?.concurrencyLimit || 5
      const limit = pLimit(concurrencyLimit)

      this.log.debug(
        `Processing ${allWatchlistItems.length} watchlist items with concurrency limit of ${concurrencyLimit}`,
      )

      const processingResults = await Promise.allSettled(
        allWatchlistItems.map((item) =>
          limit(async () => {
            const numericUserId = item.user_id

            if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
              this.log.warn(
                `Item "${item.title}" has invalid user_id: ${item.user_id}, skipping`,
              )
              return { type: 'skipped', reason: 'invalid_user_id' }
            }

            // Check if user has sync enabled
            const canSync = userSyncStatus.get(numericUserId)

            if (canSync === false) {
              this.log.debug(
                `Skipping item "${item.title}" during sync as user ${numericUserId} has sync disabled`,
              )
              return { type: 'skipped', reason: 'user_setting' }
            }

            // Parse GUIDs once for reuse
            const parsedGuids = parseGuids(item.guids)

            // Convert item to temp format for processing
            const tempItem: TemptRssWatchlistItem = {
              title: item.title,
              type: item.type,
              thumb: item.thumb ?? undefined,
              guids: parsedGuids,
              genres: parseGenres(item.genres),
              key: item.key,
            }

            // Process shows
            if (item.type === 'show') {
              // Check for TVDB ID using extractTvdbId
              const tvdbId = extractTvdbId(parsedGuids)

              if (tvdbId === 0) {
                return {
                  type: 'skipped',
                  reason: 'missing_id',
                  title: tempItem.title,
                  contentType: 'show',
                }
              }

              // Use helper for routing-aware existence check and routing
              const user = userById.get(numericUserId)
              const sonarrItem: SonarrItem = {
                title: tempItem.title,
                guids: parsedGuids,
                type: 'show',
                ended: false,
                genres: parseGenres(tempItem.genres),
                status: 'pending',
                series_status: 'continuing',
              }

              const wasAdded = await this.processShowWithRouting({
                tempItem,
                numericUserId,
                userName: user?.name,
                sonarrItem,
                existingSeries,
                primaryUser,
              })

              return { type: 'show', added: wasAdded }
            }
            // Process movies
            else if (item.type === 'movie') {
              // Check for TMDB ID using extractTmdbId
              const tmdbId = extractTmdbId(parsedGuids)

              if (tmdbId === 0) {
                return {
                  type: 'skipped',
                  reason: 'missing_id',
                  title: tempItem.title,
                  contentType: 'movie',
                }
              }

              // Use helper for routing-aware existence check and routing
              const user = userById.get(numericUserId)
              const radarrItem: RadarrItem = {
                title: tempItem.title,
                guids: parsedGuids,
                type: 'movie',
                genres: parseGenres(tempItem.genres),
              }

              const wasAdded = await this.processMovieWithRouting({
                tempItem,
                numericUserId,
                userName: user?.name,
                radarrItem,
                existingMovies,
                primaryUser,
              })

              return { type: 'movie', added: wasAdded }
            }

            return { type: 'unknown' }
          }),
        ),
      )

      // Aggregate results
      for (const result of processingResults) {
        if (result.status === 'fulfilled') {
          const value = result.value
          if (value.type === 'show' && value.added) {
            showsAdded++
          } else if (value.type === 'movie' && value.added) {
            moviesAdded++
          } else if (value.type === 'skipped') {
            if (value.reason === 'user_setting') {
              skippedDueToUserSetting++
            } else if (value.reason === 'missing_id') {
              skippedDueToMissingIds++
              if (value.contentType === 'show') {
                skippedItems.shows.push(value.title)
              } else if (value.contentType === 'movie') {
                skippedItems.movies.push(value.title)
              }
            }
          }
        } else {
          this.log.error(
            { error: result.reason },
            'Error processing watchlist item during reconciliation',
          )
        }
      }

      // Prepare summary statistics
      const summary = {
        added: {
          shows: showsAdded,
          movies: moviesAdded,
        },
        unmatched: {
          shows: unmatchedShows,
          movies: unmatchedMovies,
        },
        skippedDueToUserSetting,
        skippedDueToMissingIds,
      }

      this.log.info(
        {
          added: summary.added,
          unmatched: summary.unmatched,
          skippedDueToUserSetting: summary.skippedDueToUserSetting,
          skippedDueToMissingIds: summary.skippedDueToMissingIds,
        },
        'Watchlist sync completed',
      )

      // Update auto-approval records to attribute them to actual users
      await this.updateAutoApprovalUserAttribution(shows, movies, userById)

      // Sync statuses after adding new content to ensure tags are applied
      // Pass the already-fetched data to avoid redundant API calls
      try {
        const { shows: showUpdates, movies: movieUpdates } =
          await this.showStatusService.syncAllStatuses({
            existingSeries,
            existingMovies,
          })
        this.log.debug(
          `Updated ${showUpdates} show statuses and ${movieUpdates} movie statuses after watchlist sync`,
        )
      } catch (statusError) {
        this.log.warn(
          { error: statusError },
          'Error syncing statuses after watchlist sync (non-fatal)',
        )
        // Continue despite this error
      }

      // Log warnings about unmatched items
      if (unmatchedShows > 0 || unmatchedMovies > 0) {
        this.log.debug(
          `Found ${unmatchedShows} shows and ${unmatchedMovies} movies in Sonarr/Radarr that are not in watchlists`,
        )
      }

      // Log skipped items info
      if (skippedDueToUserSetting > 0) {
        this.log.info(
          `Skipped ${skippedDueToUserSetting} items due to user sync settings`,
        )
      }

      if (skippedDueToMissingIds > 0) {
        const showsRemaining = Math.max(0, skippedItems.shows.length - 3)
        const moviesRemaining = Math.max(0, skippedItems.movies.length - 3)
        this.log.warn(
          {
            total: skippedDueToMissingIds,
            shows: {
              count: skippedItems.shows.length,
              examples: skippedItems.shows.slice(0, 3),
              ...(showsRemaining > 0 && { andMore: showsRemaining }),
            },
            movies: {
              count: skippedItems.movies.length,
              examples: skippedItems.movies.slice(0, 3),
              ...(moviesRemaining > 0 && { andMore: moviesRemaining }),
            },
          },
          'Skipped items due to missing required IDs',
        )
      }
    } catch (error) {
      this.log.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Error during watchlist sync',
      )
      throw error
    }
  }

  /**
   * Helper to check if shows exist in target instances and route if needed.
   *
   * When existingSeries is provided (full reconciliation path), uses pre-fetched bulk
   * data for efficient batch processing. When not provided (ETag routing path), uses
   * single-item API lookup for efficiency with small batches.
   *
   * @returns true if content was added, false if it already exists
   */
  private async processShowWithRouting(params: {
    tempItem: TemptRssWatchlistItem
    numericUserId: number
    userName: string | undefined
    sonarrItem: SonarrItem
    existingSeries?: SonarrItem[]
    primaryUser: Awaited<ReturnType<FastifyInstance['db']['getPrimaryUser']>>
  }): Promise<boolean> {
    const {
      tempItem,
      numericUserId,
      userName,
      sonarrItem,
      existingSeries,
      primaryUser,
    } = params

    // Get target instances based on routing rules for this user/content
    const context: RoutingContext = {
      userId: numericUserId,
      userName,
      itemKey: tempItem.key,
      contentType: 'show',
      syncing: false,
    }
    const targetInstanceIds = await this.contentRouter.getTargetInstances(
      sonarrItem,
      context,
    )

    if (targetInstanceIds.length === 0) {
      this.log.warn(
        `No target instances available for show ${tempItem.title}, skipping`,
      )
      return false
    }

    // Check if show exists in target instances (routing-aware existence check)
    let existsInTargetInstance = false

    if (existingSeries) {
      // Full reconciliation path: use pre-fetched bulk data for efficiency
      const targetInstanceSeries = existingSeries.filter((series) => {
        return (
          series.sonarr_instance_id !== undefined &&
          targetInstanceIds.includes(series.sonarr_instance_id)
        )
      })

      const potentialMatches = targetInstanceSeries
        .map((series) => ({
          series,
          score: getGuidMatchScore(
            parseGuids(series.guids),
            parseGuids(tempItem.guids),
          ),
        }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)

      existsInTargetInstance = potentialMatches.length > 0
    } else {
      // ETag routing path: use single-item API lookup on target instances only
      const tvdbId = extractTvdbId(parseGuids(tempItem.guids))
      if (tvdbId > 0) {
        for (const instanceId of targetInstanceIds) {
          const result = await this.sonarrManager.seriesExistsByTvdbId(
            instanceId,
            tvdbId,
          )
          if (result.found) {
            existsInTargetInstance = true
            break
          }
        }
      }
    }

    // If already exists in target instance, skip without checking Plex
    if (existsInTargetInstance) {
      this.log.debug(
        `Show ${tempItem.title} already exists in target instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
      )
      return false
    }

    // Only check Plex if item doesn't exist in Sonarr AND config is enabled
    let existsOnPlex = false
    if (this.fastify.config.skipIfExistsOnPlex) {
      // Determine if the requesting user is the primary token user
      const isPrimaryUser = primaryUser
        ? numericUserId === primaryUser.id
        : false

      existsOnPlex =
        await this.fastify.plexServerService.checkExistenceAcrossServers(
          tempItem.key,
          'show',
          isPrimaryUser,
        )
    }

    // Add to Sonarr if not exists on Plex
    if (!existsOnPlex) {
      const { routedInstances } = await this.contentRouter.routeContent(
        sonarrItem,
        tempItem.key,
        {
          userId: numericUserId,
          syncing: false,
        },
      )

      // Send notification only if content was actually routed and not already notified
      if (routedInstances.length > 0 && userName) {
        // Check if notification was already sent for this user/title
        const existingNotifications =
          await this.dbService.checkExistingWebhooks(numericUserId, [
            tempItem.title,
          ])

        if (!existingNotifications.get(tempItem.title)) {
          await this.plexService.sendWatchlistNotifications(
            {
              userId: numericUserId,
              username: userName,
              watchlistId: String(numericUserId),
            },
            {
              title: tempItem.title,
              type: 'show',
              thumb: tempItem.thumb,
            },
          )
        } else {
          this.log.debug(
            `Skipping notification for "${tempItem.title}" - already sent previously to user ${userName}`,
          )
        }
      }

      return true
    }

    // If we get here, item exists on Plex - skip addition
    this.log.info(
      `Show ${tempItem.title} already exists on an accessible Plex server, skipping addition`,
    )
    return false
  }

  /**
   * Helper to check if movies exist in target instances and route if needed.
   *
   * When existingMovies is provided (full reconciliation path), uses pre-fetched bulk
   * data for efficient batch processing. When not provided (ETag routing path), uses
   * single-item API lookup for efficiency with small batches.
   *
   * @returns true if content was added, false if it already exists
   */
  private async processMovieWithRouting(params: {
    tempItem: TemptRssWatchlistItem
    numericUserId: number
    userName: string | undefined
    radarrItem: RadarrItem
    existingMovies?: RadarrItem[]
    primaryUser: Awaited<ReturnType<FastifyInstance['db']['getPrimaryUser']>>
  }): Promise<boolean> {
    const {
      tempItem,
      numericUserId,
      userName,
      radarrItem,
      existingMovies,
      primaryUser,
    } = params

    // Get target instances based on routing rules for this user/content
    const context: RoutingContext = {
      userId: numericUserId,
      userName,
      itemKey: tempItem.key,
      contentType: 'movie',
      syncing: false,
    }
    const targetInstanceIds = await this.contentRouter.getTargetInstances(
      radarrItem,
      context,
    )

    if (targetInstanceIds.length === 0) {
      this.log.warn(
        `No target instances available for movie ${tempItem.title}, skipping`,
      )
      return false
    }

    // Check if movie exists in target instances (routing-aware existence check)
    let existsInTargetInstance = false

    if (existingMovies) {
      // Full reconciliation path: use pre-fetched bulk data for efficiency
      const targetInstanceMovies = existingMovies.filter((movie) => {
        return (
          movie.radarr_instance_id !== undefined &&
          targetInstanceIds.includes(movie.radarr_instance_id)
        )
      })

      const potentialMatches = targetInstanceMovies
        .map((movie) => ({
          movie,
          score: getGuidMatchScore(
            parseGuids(movie.guids),
            parseGuids(tempItem.guids),
          ),
        }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)

      existsInTargetInstance = potentialMatches.length > 0
    } else {
      // ETag routing path: use single-item API lookup on target instances only
      const tmdbId = extractTmdbId(parseGuids(tempItem.guids))
      if (tmdbId > 0) {
        for (const instanceId of targetInstanceIds) {
          const result = await this.radarrManager.movieExistsByTmdbId(
            instanceId,
            tmdbId,
          )
          if (result.found) {
            existsInTargetInstance = true
            break
          }
        }
      }
    }

    // If already exists in target instance, skip without checking Plex
    if (existsInTargetInstance) {
      this.log.debug(
        `Movie ${tempItem.title} already exists in target instance(s) ${targetInstanceIds.join(', ')}, skipping addition`,
      )
      return false
    }

    // Only check Plex if item doesn't exist in Radarr AND config is enabled
    let existsOnPlex = false
    if (this.fastify.config.skipIfExistsOnPlex) {
      // Determine if the requesting user is the primary token user
      const isPrimaryUser = primaryUser
        ? numericUserId === primaryUser.id
        : false

      existsOnPlex =
        await this.fastify.plexServerService.checkExistenceAcrossServers(
          tempItem.key,
          'movie',
          isPrimaryUser,
        )
    }

    // Add to Radarr if not exists on Plex
    if (!existsOnPlex) {
      const { routedInstances } = await this.contentRouter.routeContent(
        radarrItem,
        tempItem.key,
        {
          userId: numericUserId,
          syncing: false,
        },
      )

      // Send notification only if content was actually routed and not already notified
      if (routedInstances.length > 0 && userName) {
        // Check if notification was already sent for this user/title
        const existingNotifications =
          await this.dbService.checkExistingWebhooks(numericUserId, [
            tempItem.title,
          ])

        if (!existingNotifications.get(tempItem.title)) {
          await this.plexService.sendWatchlistNotifications(
            {
              userId: numericUserId,
              username: userName,
              watchlistId: String(numericUserId),
            },
            {
              title: tempItem.title,
              type: 'movie',
              thumb: tempItem.thumb,
            },
          )
        } else {
          this.log.debug(
            `Skipping notification for "${tempItem.title}" - already sent previously to user ${userName}`,
          )
        }
      }

      return true
    }

    // If we get here, item exists on Plex - skip addition
    this.log.info(
      `Movie ${tempItem.title} already exists on an accessible Plex server, skipping addition`,
    )
    return false
  }

  private arraysEqualIgnoreOrder<T>(a: T[], b: T[]): boolean {
    return a.length === b.length && a.every((v) => b.includes(v))
  }

  /**
   * Checks if a condition or condition group contains a user field
   *
   * @param condition - The condition or condition group to check
   * @returns True if the condition contains a user field
   */
  private hasUserField(
    condition: Condition | ConditionGroup | undefined,
  ): boolean {
    // Base case: undefined or null
    if (!condition) {
      return false
    }

    // Check if this is a condition with field === 'user'
    if ('field' in condition && condition.field === 'user') {
      return true
    }

    // Check if this is a condition group with sub-conditions
    if ('conditions' in condition && Array.isArray(condition.conditions)) {
      return condition.conditions.some((subCondition) =>
        this.hasUserField(subCondition),
      )
    }

    // Otherwise, return false
    return false
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

            // Stop ETag polling during full reconciliation to prevent conflicts
            if (this.etagCheckInterval) {
              clearInterval(this.etagCheckInterval)
              this.etagCheckInterval = null
              this.log.debug('Stopped ETag polling for periodic reconciliation')
            }

            try {
              // Perform full reconciliation (this also re-establishes ETag baselines)
              await this.reconcile({ mode: 'full' })

              // Update timing trackers
              this.lastSuccessfulSyncTime = Date.now()

              this.log.info('Periodic reconciliation completed successfully')
            } finally {
              // Restart ETag polling with fresh interval
              this.startEtagCheckInterval()
              this.log.debug(
                'Restarted ETag polling after periodic reconciliation',
              )

              // Schedule next periodic reconciliation for +40 minutes
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
    try {
      const existingSchedule = await this.fastify.db.getScheduleByName(
        this.MANUAL_SYNC_JOB_NAME,
      )

      if (existingSchedule) {
        this.log.info(
          'Found existing periodic reconciliation job from previous run, cleaning up',
        )
        await this.fastify.scheduler.unscheduleJob(this.MANUAL_SYNC_JOB_NAME)
        await this.fastify.db.deleteSchedule(this.MANUAL_SYNC_JOB_NAME)
        this.log.info(
          'Successfully cleaned up existing periodic reconciliation job',
        )
      }
    } catch (error) {
      this.log.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'Error cleaning up existing periodic reconciliation job',
      )
      throw error
    }
  }

  /**
   * Updates auto-approval records that were created with System user (ID: 0)
   * to attribute them to the actual users who added the content to their watchlists.
   * Optionally accepts prefetched watchlist arrays to avoid extra DB reads.
   */
  private async updateAutoApprovalUserAttribution(
    prefetchedShows?: TokenWatchlistItem[],
    prefetchedMovies?: TokenWatchlistItem[],
    userById?: Map<number, Awaited<ReturnType<typeof this.dbService.getUser>>>,
  ): Promise<void> {
    try {
      this.log.debug('Updating auto-approval user attribution')

      // Get all auto-approval records created by system user (ID: 0)
      const systemApprovalRecords =
        await this.dbService.getApprovalRequestsByCriteria({
          userId: 0,
          status: 'auto_approved',
        })

      if (systemApprovalRecords.length === 0) {
        this.log.debug('No system auto-approval records found to update')
        return
      }

      this.log.debug(
        `Found ${systemApprovalRecords.length} system auto-approval records to process`,
      )

      // Get all watchlist items for matching (reuse prefetched lists if provided)
      const watchlistShows =
        prefetchedShows ?? (await this.dbService.getAllShowWatchlistItems())
      const watchlistMovies =
        prefetchedMovies ?? (await this.dbService.getAllMovieWatchlistItems())
      const allWatchlistItems = [...watchlistShows, ...watchlistMovies]

      // Build indexes for fast and unambiguous lookups
      const keyIndex = new Map<string, TokenWatchlistItem[]>()
      const guidIndex = new Map<string, TokenWatchlistItem[]>()
      for (const item of allWatchlistItems) {
        if (item.key) {
          const arr = keyIndex.get(item.key)
          if (arr) arr.push(item)
          else keyIndex.set(item.key, [item])
        }
        for (const g of parseGuids(item.guids)) {
          const arr = guidIndex.get(g)
          if (arr) arr.push(item)
          else guidIndex.set(g, [item])
        }
      }

      let updatedRecords = 0
      let ambiguousRecords = 0

      const normalizeUserId = (val: unknown): number | null => {
        const id =
          typeof val === 'number'
            ? val
            : typeof val === 'object' && val !== null && 'id' in val
              ? (val as { id: number }).id
              : Number.parseInt(String(val), 10)
        return Number.isFinite(id) && id > 0 ? (id as number) : null
      }

      for (const approvalRecord of systemApprovalRecords) {
        try {
          // Prefer exact content key match
          let matchingWatchlistItem: TokenWatchlistItem | undefined
          if (approvalRecord.contentKey) {
            const keyCandidates = keyIndex.get(approvalRecord.contentKey)
            if (keyCandidates && keyCandidates.length === 1) {
              matchingWatchlistItem = keyCandidates[0]
            } else if (keyCandidates && keyCandidates.length > 1) {
              // Disambiguate: attribute only if all candidates resolve to the same user
              const userIds = new Set<number>()
              for (const it of keyCandidates) {
                const uid = normalizeUserId(it.user_id)
                if (uid) userIds.add(uid)
              }
              if (userIds.size === 1) {
                const onlyUserId = [...userIds][0]
                matchingWatchlistItem = keyCandidates.find(
                  (it) => normalizeUserId(it.user_id) === onlyUserId,
                )
              } else {
                ambiguousRecords++
                this.log.warn(
                  `Ambiguous key match for approval record ${approvalRecord.id} ("${approvalRecord.contentTitle}"); multiple users share content key. Skipping attribution to avoid misattribution.`,
                )
                continue
              }
            }
          }

          // Fallback to GUID-based candidates if no key match
          if (!matchingWatchlistItem) {
            const recordGuids = parseGuids(approvalRecord.contentGuids)
            const candidateSet = new Set<TokenWatchlistItem>()
            for (const g of recordGuids) {
              const arr = guidIndex.get(g)
              if (arr) {
                for (const it of arr) candidateSet.add(it)
              }
            }
            const candidates = [...candidateSet]

            if (candidates.length === 1) {
              matchingWatchlistItem = candidates[0]
            } else if (candidates.length > 1) {
              // Disambiguate: attribute only if all candidates resolve to the same user
              const userIds = new Set<number>()
              for (const it of candidates) {
                const uid = normalizeUserId(it.user_id)
                if (uid) userIds.add(uid)
              }
              if (userIds.size === 1) {
                const onlyUserId = [...userIds][0]
                matchingWatchlistItem = candidates.find(
                  (it) => normalizeUserId(it.user_id) === onlyUserId,
                )
              } else {
                ambiguousRecords++
                this.log.warn(
                  `Ambiguous GUID match for approval record ${approvalRecord.id} ("${approvalRecord.contentTitle}"); multiple users share GUIDs. Skipping attribution to avoid misattribution.`,
                )
                continue
              }
            }
          }

          if (matchingWatchlistItem) {
            // Normalize user ID
            const numericUserId = normalizeUserId(matchingWatchlistItem.user_id)

            if (!numericUserId) {
              this.log.warn(
                `Invalid user_id "${matchingWatchlistItem.user_id}" for approval record ${approvalRecord.id}`,
              )
              continue
            }

            // Get user details (from cache if available, otherwise query DB)
            const user =
              userById?.get(numericUserId) ??
              (await this.dbService.getUser(numericUserId))
            if (!user) {
              this.log.warn(
                `User ${numericUserId} not found for approval record ${approvalRecord.id}`,
              )
              continue
            }

            // Update the approval record with the real user
            const updatedRequest =
              await this.dbService.updateApprovalRequestAttribution(
                approvalRecord.id,
                numericUserId,
                `Auto-approved for ${user.name} (attribution updated during reconciliation)`,
              )

            this.log.debug(
              `Updated auto-approval record ${approvalRecord.id} from System to ${user.name} for "${approvalRecord.contentTitle}"`,
            )
            updatedRecords++

            // Emit SSE event for the updated attribution using the same format as approval service
            if (
              this.fastify.progress?.hasActiveConnections() &&
              updatedRequest
            ) {
              const metadata = {
                action: 'updated' as const,
                requestId: updatedRequest.id,
                userId: updatedRequest.userId,
                userName: updatedRequest.userName || user.name,
                contentTitle: updatedRequest.contentTitle,
                contentType: updatedRequest.contentType,
                status: updatedRequest.status,
              }

              this.fastify.progress.emit({
                operationId: `approval-${updatedRequest.id}`,
                type: 'approval',
                phase: 'updated',
                progress: 100,
                message: `Updated auto-approval attribution for "${updatedRequest.contentTitle}" to ${user.name}`,
                metadata,
              })
            }
          } else {
            this.log.debug(
              `No matching watchlist item found for auto-approval record: "${approvalRecord.contentTitle}" (${approvalRecord.contentKey})`,
            )
          }
        } catch (error) {
          this.log.error(
            { error },
            `Failed to update user attribution for approval record ${approvalRecord.id}`,
          )
        }
      }

      if (updatedRecords > 0) {
        this.log.info(
          `Updated user attribution for ${updatedRecords} auto-approval records`,
        )
      } else {
        this.log.debug(
          'No auto-approval records needed user attribution updates',
        )
      }
      if (ambiguousRecords > 0) {
        this.log.warn(
          `Skipped ${ambiguousRecords} auto-approval records due to ambiguous GUID matches across multiple users`,
        )
      }
    } catch (error) {
      this.log.error(
        { error },
        'Failed to update auto-approval user attribution',
      )
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Schedule the next periodic reconciliation to run in 40 minutes
   */
  private async schedulePendingReconciliation(): Promise<void> {
    try {
      const scheduleTime = new Date(Date.now() + 40 * 60 * 1000) // +40 minutes

      await this.fastify.scheduler.updateJobSchedule(
        this.MANUAL_SYNC_JOB_NAME,
        {
          minutes: 20,
          runImmediately: false,
        },
        true,
      )

      const delayMinutes = Math.round(
        (scheduleTime.getTime() - Date.now()) / 60000,
      )
      this.log.info(
        `Scheduled next periodic reconciliation in ${delayMinutes} minutes`,
      )
    } catch (error) {
      this.log.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'Error scheduling pending reconciliation',
      )
      throw error
    }
  }

  /**
   * Cancel any pending periodic reconciliation job
   */
  private async unschedulePendingReconciliation(): Promise<void> {
    try {
      // Simply disable the job - scheduler handles existence check internally
      await this.fastify.scheduler.updateJobSchedule(
        this.MANUAL_SYNC_JOB_NAME,
        null,
        false,
      )

      this.log.debug('Unscheduled pending periodic reconciliation')
    } catch (error) {
      this.log.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'Error unscheduling pending reconciliation',
      )
      // Don't throw here - this is called during sync start and shouldn't block sync
    }
  }
}
