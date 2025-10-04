/**
 * Watchlist Workflow Service
 *
 * Handles the synchronization between Plex watchlists and Sonarr/Radarr via RSS feeds.
 * This service is responsible for monitoring Plex watchlists for changes, processing
 * those changes, and routing items to the appropriate Sonarr/Radarr instances.
 *
 * Responsible for:
 * - Monitoring Plex watchlists via RSS feeds
 * - Detecting changes to watchlist items (additions, modifications, removals)
 * - Processing new items and routing them to Sonarr or Radarr as appropriate
 * - Managing a queue of pending changes to handle in batches
 * - Coordinating with other services (PlexWatchlist, SonarrManager, RadarrManager)
 * - Supporting differential sync for users with disabled synchronization
 * - Maintaining state between RSS checks to detect actual changes
 *
 * The service operates using interval-based polling to check RSS feeds periodically
 * and processes items in batches for efficiency.
 *
 * @example
 * // Starting the workflow in a Fastify plugin:
 * fastify.decorate('watchlistWorkflow', new WatchlistWorkflowService(log, fastify));
 * await fastify.watchlistWorkflow.startWorkflow();
 */

import type {
  RssWatchlistResults,
  TemptRssWatchlistItem,
  TokenWatchlistItem,
  WatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Condition, ConditionGroup } from '@root/types/router.types.js'
import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  extractTmdbId,
  extractTvdbId,
  getGuidMatchScore,
  parseGuids,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

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

  /** Interval timer for processing the change queue */
  private queueCheckInterval: NodeJS.Timeout | null = null

  /** Timestamp of when the last item was added to the queue */
  private lastQueueItemTime: number = Date.now()

  /** Queue of watchlist items that have changed and need processing */
  private changeQueue: Set<TemptRssWatchlistItem> = new Set()

  /** Previous snapshot of self-watchlist items for change detection */
  private previousSelfItems: Map<string, WatchlistItem> = new Map()

  /** Previous snapshot of friends-watchlist items for change detection */
  private previousFriendsItems: Map<string, WatchlistItem> = new Map()

  /** Flag to track if first self feed has been processed */
  private hasProcessedInitialFeed: { self: boolean; friends: boolean } = {
    self: false,
    friends: false,
  }

  /** Flag to prevent concurrent refresh operations */
  private isRefreshing = false

  /** Flag to prevent concurrent execution between queue processing and periodic reconciliation */
  private isProcessingWorkflow = false

  /** Flag to indicate if using RSS fallback */
  private isUsingRssFallback = false

  /** Timestamp of the last successful watchlist sync */
  private lastSuccessfulSyncTime: number = Date.now()

  /**
   * Creates a new WatchlistWorkflowService instance
   *
   * @param log - Fastify logger instance for recording workflow operations
   * @param fastify - Fastify instance for accessing other services
   * @param rssCheckIntervalMs - Interval in ms between RSS feed checks
   * @param queueProcessDelayMs - Delay in ms before processing queued items
   */
  constructor(
    private readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly rssCheckIntervalMs: number = 10000,
    private readonly queueProcessDelayMs: number = 60000,
  ) {
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
        this.log.warn({
          error: reconciliationError,
        })
        // Continue despite this error
      }

      // Initial sync regardless of method
      try {
        this.log.debug('Starting initial watchlist fetch')
        await this.fetchWatchlists()

        this.log.debug('Starting initial watchlist item sync')
        await this.syncWatchlistItems()

        // Update last successful sync time after initial sync
        this.lastSuccessfulSyncTime = Date.now()
        this.log.debug('Set initial last successful sync time')

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
          'Error during initial watchlist synchronization',
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

        throw new Error('Failed during initial watchlist synchronization', {
          cause: syncError,
        })
      }

      // Start queue processor
      this.log.debug('Starting queue processor')
      this.startQueueProcessor()

      // Update status to running after everything is initialized
      this.status = 'running'
      this.initialized = true

      // Set the RSS mode flag based on whether we're using RSS fallback
      this.rssMode = !this.isUsingRssFallback

      this.log.info(
        `Watchlist workflow running in ${this.isUsingRssFallback ? 'periodic reconciliation' : 'RSS'} mode with periodic reconciliation`,
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

    // Clear queue processor interval
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval)
      this.queueCheckInterval = null
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

    // Clear any pending changes
    this.changeQueue.clear()

    // Update status
    this.status = 'stopped'
    this.initialized = false
    this.rssMode = false

    return true
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

      // Sync statuses with Sonarr/Radarr
      try {
        const { shows, movies } = await this.showStatusService.syncAllStatuses()
        this.log.debug(
          `Updated ${shows} show statuses and ${movies} movie statuses after watchlist refresh`,
        )
      } catch (error) {
        this.log.warn({ error }, 'Error syncing statuses (non-fatal):')
        // Continue despite this error
      }
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
      this.log.debug({
        itemCount: this.previousSelfItems.size,
      })
    }

    // Process friends watchlist
    if (results.friends.users[0]?.watchlist) {
      this.previousFriendsItems = this.createItemMap(
        results.friends.users[0].watchlist,
      )
      this.log.debug({
        itemCount: this.previousFriendsItems.size,
      })
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
   * Detects changes in both self and friends feeds and adds changed items to the queue.
   *
   * @param results - RSS watchlist results containing both self and friends data
   */
  private async processRssResults(results: RssWatchlistResults): Promise<void> {
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

          // If this is the first time we're seeing content, we should process all items as new
          if (this.hasProcessedInitialFeed.self === false) {
            this.log.info('Processing initial items from first valid feed')
            const allItemsAsChanges = new Set(
              currentWatchlist.map((item) => this.convertToTempItem(item)),
            )
            await this.addToQueue(allItemsAsChanges, 'self')
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
            await this.addToQueue(changes, 'self')
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

          // If this is the first time we're seeing content, we should process all items as new
          if (this.hasProcessedInitialFeed.friends === false) {
            this.log.info('Processing initial items from first valid feed')
            const allItemsAsChanges = new Set(
              currentWatchlist.map((item) => this.convertToTempItem(item)),
            )
            await this.addToQueue(allItemsAsChanges, 'friends')
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
            await this.addToQueue(changes, 'friends')
          }
          this.previousFriendsItems = currentItems
        }
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
        this.log.debug({ guid, title: currentItem.title })
        changes.add(this.convertToTempItem(currentItem))
      } else {
        const hasChanged =
          previousItem.title !== currentItem.title ||
          previousItem.type !== currentItem.type ||
          previousItem.thumb !== currentItem.thumb ||
          !this.arraysEqualIgnoreOrder(
            this.safeParseArray(previousItem.genres),
            this.safeParseArray(currentItem.genres),
          )

        if (hasChanged) {
          this.log.debug({
            guid,
            title: currentItem.title,
            changes: {
              title: previousItem.title !== currentItem.title,
              type: previousItem.type !== currentItem.type,
              thumb: previousItem.thumb !== currentItem.thumb,
              genres: !this.arraysEqualIgnoreOrder(
                this.safeParseArray(previousItem.genres),
                this.safeParseArray(currentItem.genres),
              ),
            },
          })
          changes.add(this.convertToTempItem(currentItem))
        }
      }
    })

    // Check for removed items (for logging purposes)
    previousItems.forEach((item, guid) => {
      if (!currentItems.has(guid)) {
        this.log.debug({ guid, title: item.title })
      }
    })

    // Log summary if changes were detected
    if (changes.size > 0) {
      this.log.info({
        changedItemsCount: changes.size,
        previousItemsCount: previousItems.size,
        currentItemsCount: currentItems.size,
      })
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
   * Add changed items to the processing queue
   *
   * Adds new items to the change queue and optionally processes them immediately
   * if no users have sync disabled.
   *
   * @param items - Set of watchlist items that have changed
   * @param source - Source of the items ('self' or 'friends')
   */
  private async addToQueue(
    items: Set<TemptRssWatchlistItem>,
    source: 'self' | 'friends',
  ): Promise<void> {
    let hasNewItems = false

    // Check if processing should be deferred (includes both sync disabled and user routing rules)
    const shouldDefer = await this.shouldDeferProcessing()

    if (shouldDefer) {
      this.log.info(
        'Deferring item processing to reconciliation phase due to sync settings or user routing rules',
      )
    }

    // Process each item
    for (const item of items) {
      if (!this.changeQueue.has(item)) {
        this.changeQueue.add(item)
        hasNewItems = true

        // Only process immediately if we don't need to defer
        if (!shouldDefer) {
          if (item.type.toLowerCase() === 'show') {
            this.log.info(`Processing show ${item.title} immediately`)
            const normalizedItem = {
              ...item,
              type: 'show',
            }
            await this.processSonarrItem(normalizedItem)
          } else if (item.type.toLowerCase() === 'movie') {
            this.log.info(`Processing movie ${item.title} immediately`)
            const normalizedItem = {
              ...item,
              type: 'movie',
            }
            await this.processRadarrItem(normalizedItem)
          }
        } else {
          this.log.debug(
            `Queuing ${item.type} ${item.title} for later processing during reconciliation`,
          )
        }
      }
    }

    // Store items and update timestamp if new items were added
    if (hasNewItems) {
      const now = Date.now()
      this.lastQueueItemTime = now
      this.log.info(
        `Added ${items.size} changed items to queue from ${source} RSS feed`,
      )
      this.log.debug(`Queue timer updated: lastQueueItemTime=${now}`)

      // Unschedule pending reconciliation since sync will happen via queue processing
      await this.unschedulePendingReconciliation()

      try {
        await this.plexService.storeRssWatchlistItems(items, source)
        this.log.debug(`Stored ${items.size} changed ${source} RSS items`)
      } catch (error) {
        this.log.error({ error }, `Error storing ${source} RSS items:`)
      }
    }
  }

  /**
   * Check if at least one Sonarr instance is available for service operations
   *
   * @param item - Watchlist item to check (for logging context)
   * @returns Promise resolving to ExistenceCheckResult indicating availability
   */
  private async checkSonarrServiceAvailability(
    item: TemptRssWatchlistItem,
  ): Promise<ExistenceCheckResult> {
    try {
      // Use utility function to extract TVDB ID
      const tvdbId = extractTvdbId(item.guids)
      if (tvdbId === 0) {
        return {
          found: false,
          checked: false,
          serviceName: 'Sonarr',
          error: 'No valid TVDB ID found',
        }
      }

      // Get all Sonarr instances
      const instances = await this.sonarrManager.getAllInstances()
      if (instances.length === 0) {
        return {
          found: false,
          checked: false,
          serviceName: 'Sonarr',
          error: 'No Sonarr instances configured',
        }
      }

      // Check if at least one instance is available
      for (const instance of instances) {
        const result = await this.sonarrManager.seriesExistsByTvdbId(
          instance.id,
          tvdbId,
        )

        // If this instance is available, return its result
        if (result.checked) {
          return {
            found: result.found,
            checked: true,
            serviceName: result.serviceName,
            instanceId: result.instanceId,
          }
        }
      }

      // No instances were available
      return {
        found: false,
        checked: false,
        serviceName: 'Sonarr',
        error: 'All Sonarr instances unavailable',
      }
    } catch (error) {
      return {
        found: false,
        checked: false,
        serviceName: 'Sonarr',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Check if at least one Radarr instance is available for service operations
   *
   * @param item - Watchlist item to check (for logging context)
   * @returns Promise resolving to ExistenceCheckResult indicating availability
   */
  private async checkRadarrServiceAvailability(
    item: TemptRssWatchlistItem,
  ): Promise<ExistenceCheckResult> {
    try {
      // Use utility function to extract TMDB ID
      const tmdbId = extractTmdbId(item.guids)
      if (tmdbId === 0) {
        return {
          found: false,
          checked: false,
          serviceName: 'Radarr',
          error: 'No valid TMDB ID found',
        }
      }

      // Get all Radarr instances
      const instances = await this.radarrManager.getAllInstances()
      if (instances.length === 0) {
        return {
          found: false,
          checked: false,
          serviceName: 'Radarr',
          error: 'No Radarr instances configured',
        }
      }

      // Check if at least one instance is available
      for (const instance of instances) {
        const result = await this.radarrManager.movieExistsByTmdbId(
          instance.id,
          tmdbId,
        )

        // If this instance is available, return its result
        if (result.checked) {
          return {
            found: result.found,
            checked: true,
            serviceName: result.serviceName,
            instanceId: result.instanceId,
          }
        }
      }

      // No instances were available
      return {
        found: false,
        checked: false,
        serviceName: 'Radarr',
        error: 'All Radarr instances unavailable',
      }
    } catch (error) {
      return {
        found: false,
        checked: false,
        serviceName: 'Radarr',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Verify if a show already exists in any Sonarr instance
   *
   * @param item - Watchlist item to check
   * @returns Promise resolving to true if the item should be added, false otherwise
   */
  private async verifySonarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      // Use utility function to extract TVDB ID
      const tvdbId = extractTvdbId(item.guids)
      if (tvdbId === 0) {
        this.log.warn(
          {
            guids: item.guids,
          },
          `Show ${item.title} has no valid TVDB ID, skipping verification`,
        )
        return false
      }

      // Get all Sonarr instances
      const instances = await this.sonarrManager.getAllInstances()

      // Check each instance for the show using efficient lookup
      for (const instance of instances) {
        const result = await this.sonarrManager.seriesExistsByTvdbId(
          instance.id,
          tvdbId,
        )

        // If service unavailable, skip processing and let periodic sync handle it
        if (!result.checked) {
          this.log.warn(
            {
              error: result.error,
              serviceName: result.serviceName,
              instanceId: result.instanceId,
            },
            `Sonarr instance ${instance.name} unavailable for ${item.title}, skipping immediate processing`,
          )
          return false
        }

        if (result.found) {
          this.log.info(
            `Show ${item.title} already exists in Sonarr instance ${instance.name}, skipping addition`,
          )
          return false
        }
      }

      return true
    } catch (error) {
      this.log.error({ error }, `Error verifying show ${item.title} in Sonarr:`)
      throw error
    }
  }

  /**
   * Verify if a movie already exists in any Radarr instance
   *
   * @param item - Watchlist item to check
   * @returns Promise resolving to true if the item should be added, false otherwise
   */
  private async verifyRadarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      // Use utility function to extract TMDB ID
      const tmdbId = extractTmdbId(item.guids)
      if (tmdbId === 0) {
        this.log.warn(
          {
            guids: item.guids,
          },
          `Movie ${item.title} has no valid TMDB ID, skipping verification`,
        )
        return false
      }

      // Get all Radarr instances
      const instances = await this.radarrManager.getAllInstances()

      // Check each instance for the movie using efficient lookup
      for (const instance of instances) {
        const result = await this.radarrManager.movieExistsByTmdbId(
          instance.id,
          tmdbId,
        )

        // If service unavailable, skip processing and let periodic sync handle it
        if (!result.checked) {
          this.log.warn(
            {
              error: result.error,
              serviceName: result.serviceName,
              instanceId: result.instanceId,
            },
            `Radarr instance ${instance.name} unavailable for ${item.title}, skipping immediate processing`,
          )
          return false
        }

        if (result.found) {
          this.log.info(
            `Movie ${item.title} already exists in Radarr instance ${instance.name}, skipping addition`,
          )
          return false
        }
      }

      return true
    } catch (error) {
      this.log.error(
        { error },
        `Error verifying movie ${item.title} in Radarr:`,
      )
      throw error
    }
  }

  /**
   * Process a movie watchlist item and add it to Radarr
   *
   * Extracts the TMDB ID, verifies the item doesn't already exist,
   * and routes it using the content router.
   *
   * @param item - Movie watchlist item to process
   * @returns Promise resolving to true if processed successfully
   */
  private async processRadarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      // Use utility function to extract TMDB ID
      const tmdbId = extractTmdbId(item.guids)
      if (tmdbId === 0) {
        this.log.warn(
          {
            guids: item.guids,
          },
          `Movie ${item.title} has no valid TMDB ID, skipping Radarr processing`,
        )
        return false
      }

      // Verify item isn't already in Radarr
      const shouldAdd = await this.verifyRadarrItem(item)
      if (!shouldAdd) {
        return true // Item exists, considered successfully processed
      }

      // Prepare item for Radarr
      const radarrItem: RadarrItem = {
        title: item.title,
        guids: parseGuids(item.guids),
        type: 'movie',
        genres: this.safeParseArray<string>(item.genres),
      }

      // Use content router to route the item
      await this.contentRouter.routeContent(radarrItem, item.key, {
        syncing: false,
      })

      this.log.info(
        `Successfully routed movie ${item.title} via content router`,
      )

      return true
    } catch (error) {
      this.log.error(
        {
          error,
          title: item.title,
          guids: item.guids,
          type: item.type,
        },
        'Error processing movie',
      )
      throw error
    }
  }

  /**
   * Process a show watchlist item and add it to Sonarr
   *
   * Extracts the TVDB ID, verifies the item doesn't already exist,
   * and routes it using the content router.
   *
   * @param item - Show watchlist item to process
   * @returns Promise resolving to true if processed successfully
   */
  private async processSonarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      // Use utility function to extract TVDB ID
      const tvdbId = extractTvdbId(item.guids)
      if (tvdbId === 0) {
        this.log.warn(
          {
            guids: item.guids,
          },
          `Show ${item.title} has no valid TVDB ID, skipping Sonarr processing`,
        )
        return false
      }

      // Verify item isn't already in Sonarr
      const shouldAdd = await this.verifySonarrItem(item)
      if (!shouldAdd) {
        return true // Item exists, considered successfully processed
      }

      // Prepare item for Sonarr
      const sonarrItem: SonarrItem = {
        title: item.title,
        guids: parseGuids(item.guids),
        type: 'show',
        ended: false,
        genres: this.safeParseArray<string>(item.genres),
        status: 'pending',
        series_status: 'continuing', // Default to continuing since we don't know yet
      }

      // Use content router to route the item
      await this.contentRouter.routeContent(sonarrItem, item.key, {
        syncing: false,
      })

      this.log.info(`Successfully routed show ${item.title} via content router`)

      return true
    } catch (error) {
      this.log.error(
        {
          error,
          title: item.title,
          guids: item.guids,
          type: item.type,
        },
        'Error processing show in Sonarr',
      )
      throw error
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
      // Get all users to check their sync permissions
      const allUsers = await this.dbService.getAllUsers()
      const userSyncStatus = new Map<number, boolean>()

      // Create a map of user ID to their can_sync status for quick lookups
      for (const user of allUsers) {
        userSyncStatus.set(user.id, user.can_sync !== false)
      }

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
          this.log.debug({
            title: series.title,
            guids: series.guids,
          })
        }
      }

      for (const movie of existingMovies) {
        const hasMatch = movie.guids.some((guid) => watchlistGuids.has(guid))
        if (!hasMatch) {
          unmatchedMovies++
          this.log.debug({
            title: movie.title,
            guids: movie.guids,
          })
        }
      }

      // Process each watchlist item
      for (const item of allWatchlistItems) {
        // Normalize user ID
        const numericUserId =
          typeof item.user_id === 'number'
            ? item.user_id
            : typeof item.user_id === 'object' &&
                item.user_id !== null &&
                'id' in item.user_id
              ? (item.user_id as { id: number }).id
              : Number.parseInt(String(item.user_id), 10)

        if (Number.isNaN(numericUserId)) {
          this.log.warn(
            `Item "${item.title}" has invalid user_id: ${item.user_id}, skipping`,
          )
          continue
        }

        // Check if user has sync enabled
        const canSync = userSyncStatus.get(numericUserId)

        if (canSync === false) {
          this.log.debug(
            `Skipping item "${item.title}" during sync as user ${numericUserId} has sync disabled`,
          )
          skippedDueToUserSetting++
          continue
        }

        // Convert item to temp format for processing
        const tempItem: TemptRssWatchlistItem = {
          title: item.title,
          type: item.type,
          thumb: item.thumb ?? undefined,
          guids: parseGuids(item.guids),
          genres: this.safeParseArray<string>(item.genres),
          key: item.key,
        }

        // Process shows
        if (item.type === 'show') {
          // Check for TVDB ID using extractTvdbId
          const tvdbId = extractTvdbId(tempItem.guids)

          if (tvdbId === 0) {
            skippedItems.shows.push(tempItem.title)
            skippedDueToMissingIds++
            continue
          }

          // Check if show exists using GUID weighting system
          const potentialMatches = existingSeries
            .map((series) => ({
              series,
              score: getGuidMatchScore(
                parseGuids(series.guids),
                parseGuids(tempItem.guids),
              ),
            }))
            .filter((match) => match.score > 0)
            .sort((a, b) => b.score - a.score)

          const exists = potentialMatches.length > 0

          // Add to Sonarr if not exists
          if (!exists) {
            // Check service availability before attempting to route
            const serviceCheck =
              await this.checkSonarrServiceAvailability(tempItem)

            if (!serviceCheck.checked) {
              this.log.warn(
                {
                  error: serviceCheck.error,
                  serviceName: serviceCheck.serviceName,
                  instanceId: serviceCheck.instanceId,
                },
                `Sonarr service unavailable for ${tempItem.title}, skipping addition during sync`,
              )
              continue
            }

            // If the item already exists in an available service, skip it
            if (serviceCheck.found) {
              this.log.info(
                `Show ${tempItem.title} already exists in available Sonarr instance, skipping addition`,
              )
              continue
            }

            const sonarrItem: SonarrItem = {
              title: tempItem.title,
              guids: parseGuids(tempItem.guids),
              type: 'show',
              ended: false,
              genres: this.safeParseArray<string>(tempItem.genres),
              status: 'pending',
              series_status: 'continuing',
            }

            // Pass user id to the router
            await this.contentRouter.routeContent(sonarrItem, tempItem.key, {
              userId: numericUserId,
              syncing: false,
            })

            showsAdded++
          }
        }
        // Process movies
        else if (item.type === 'movie') {
          // Check for TMDB ID using extractTmdbId
          const tmdbId = extractTmdbId(tempItem.guids)

          if (tmdbId === 0) {
            skippedItems.movies.push(tempItem.title)
            skippedDueToMissingIds++
            continue
          }

          // Check if movie exists using GUID weighting system
          const potentialMatches = existingMovies
            .map((movie) => ({
              movie,
              score: getGuidMatchScore(
                parseGuids(movie.guids),
                parseGuids(tempItem.guids),
              ),
            }))
            .filter((match) => match.score > 0)
            .sort((a, b) => b.score - a.score)

          const exists = potentialMatches.length > 0

          // Add to Radarr if not exists
          if (!exists) {
            // Check service availability before attempting to route
            const serviceCheck =
              await this.checkRadarrServiceAvailability(tempItem)

            if (!serviceCheck.checked) {
              this.log.warn(
                {
                  error: serviceCheck.error,
                  serviceName: serviceCheck.serviceName,
                  instanceId: serviceCheck.instanceId,
                },
                `Radarr service unavailable for ${tempItem.title}, skipping addition during sync`,
              )
              continue
            }

            // If the item already exists in an available service, skip it
            if (serviceCheck.found) {
              this.log.info(
                `Movie ${tempItem.title} already exists in available Radarr instance, skipping addition`,
              )
              continue
            }

            const radarrItem: RadarrItem = {
              title: tempItem.title,
              guids: parseGuids(tempItem.guids),
              type: 'movie',
              genres: this.safeParseArray<string>(tempItem.genres),
            }

            // Pass user id to the router
            await this.contentRouter.routeContent(radarrItem, tempItem.key, {
              userId: numericUserId,
              syncing: false,
            })

            moviesAdded++
          }
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

      this.log.info(`Watchlist sync completed: ${JSON.stringify(summary)}`)

      // Update auto-approval records to attribute them to actual users
      await this.updateAutoApprovalUserAttribution(shows, movies)

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
        const showsList =
          skippedItems.shows.length > 0
            ? `${skippedItems.shows.length} shows (${skippedItems.shows
                .slice(0, 3)
                .map((title) => `"${title}"`)
                .join(', ')}${skippedItems.shows.length > 3 ? '...' : ''})`
            : ''
        const moviesList =
          skippedItems.movies.length > 0
            ? `${skippedItems.movies.length} movies (${skippedItems.movies
                .slice(0, 3)
                .map((title) => `"${title}"`)
                .join(', ')}${skippedItems.movies.length > 3 ? '...' : ''})`
            : ''
        const parts = [showsList, moviesList].filter(Boolean)
        this.log.warn(
          `Skipped ${skippedDueToMissingIds} items due to missing required IDs - ${parts.join(', ')}`,
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
   * Start the queue processor interval
   *
   * Sets up periodic processing of queued changes after a delay.
   */
  private startQueueProcessor(): void {
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval)
    }

    this.queueCheckInterval = setInterval(async () => {
      // Avoid concurrent processing with other operations
      if (this.isRefreshing || this.isProcessingWorkflow) {
        this.log.debug(
          'Skipping queue processing - concurrent operation in progress',
        )
        return
      }

      // Check if enough time has passed and there are items to process
      const timeSinceLastItem = Date.now() - this.lastQueueItemTime

      if (
        timeSinceLastItem >= this.queueProcessDelayMs &&
        this.changeQueue.size > 0
      ) {
        // Set both flags to prevent any concurrent operations
        this.isRefreshing = true
        this.isProcessingWorkflow = true

        try {
          const queueSize = this.changeQueue.size
          this.log.info(
            'Queue process delay reached, checking processing requirements',
          )
          this.changeQueue.clear()

          // Check if we need to defer processing
          const shouldDefer = await this.shouldDeferProcessing()

          if (shouldDefer) {
            this.log.info(
              'Performing full sync reconciliation due to sync settings or user routing rules',
            )
            // First refresh the watchlists
            await this.fetchWatchlists()
            // Then run full sync check
            await this.syncWatchlistItems()
            // Update last successful sync time after full sync
            const now = Date.now()
            this.lastSuccessfulSyncTime = now
            // Reset deferral timer to prevent immediate periodic reconciliation after queue processing
            this.lastQueueItemTime = now
            this.log.debug('Updated last successful sync time after full sync')
            this.log.debug(
              'Reset deferral timer after queue processing to prevent immediate periodic reconciliation overlap',
            )

            // Schedule next reconciliation after full sync completion
            await this.schedulePendingReconciliation()
          } else {
            this.log.info('Performing standard watchlist refresh')
            await this.fetchWatchlists()
            await this.syncWatchlistItems()
            // Update last successful sync time after watchlist refresh
            const now = Date.now()
            this.lastSuccessfulSyncTime = now
            // Reset deferral timer to prevent immediate periodic reconciliation after queue processing
            this.lastQueueItemTime = now
            this.log.debug(
              'Updated last successful sync time after watchlist refresh',
            )
            this.log.debug(
              'Reset deferral timer after queue processing to prevent immediate periodic reconciliation overlap',
            )

            // Schedule next reconciliation after watchlist refresh completion
            await this.schedulePendingReconciliation()
          }

          this.log.info(`Queue processing completed for ${queueSize} items`)
        } catch (error) {
          // Don't set status to 'stopped' or stop the workflow
          // This allows the workflow to continue and self-heal via reconciliation
          this.log.error(
            {
              error,
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
            },
            'Error in queue processing - will recover via scheduled reconciliation',
          )

          // Ensure failsafe is scheduled even after queue processing failure
          try {
            await this.schedulePendingReconciliation()
          } catch (scheduleError) {
            this.log.error(
              { error: scheduleError },
              'Failed to schedule failsafe after queue processing error',
            )
          }

          // Don't throw - let the workflow continue running
        } finally {
          this.isRefreshing = false
          this.isProcessingWorkflow = false
        }
      }
    }, 10000) // Check every 10 seconds
  }

  /**
   * Checks if processing should be deferred to reconciliation phase
   *
   * @returns Promise<boolean> True if processing should be deferred
   */
  private async shouldDeferProcessing(): Promise<boolean> {
    // Check if any users have sync disabled
    const hasUsersWithSyncDisabled =
      await this.dbService.hasUsersWithSyncDisabled()

    // Check if any user-related routing rules exist (only enabled ones)
    const conditionalRules =
      await this.fastify.db.getRouterRulesByType('conditional')
    const hasUserRoutingRules = conditionalRules.some((rule) => {
      // Skip disabled rules
      if (rule.enabled === false) return false

      const criteria = rule.criteria?.condition as
        | Condition
        | ConditionGroup
        | undefined
      return this.hasUserField(criteria)
    })

    // Check if any users have approval configuration (quotas, requires_approval, approval router rules)
    const hasUsersWithApprovalConfig =
      await this.dbService.hasUsersWithApprovalConfig()

    return (
      hasUsersWithSyncDisabled ||
      hasUserRoutingRules ||
      hasUsersWithApprovalConfig
    )
  }

  private safeParseArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value as T[]
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return (
          Array.isArray(parsed) ? parsed : [parsed].filter(Boolean)
        ) as T[]
      } catch (_e) {
        return (value ? [value] : []) as T[]
      }
    }

    return (value ? [value] : []) as T[]
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

            this.log.info('Periodic reconciliation triggered - performing sync')

            // Unschedule this job to prevent concurrent execution
            await this.unschedulePendingReconciliation()

            // Set flags to prevent concurrent operations
            this.isRefreshing = true
            this.isProcessingWorkflow = true

            try {
              // Perform the sync
              await this.fetchWatchlists()
              await this.syncWatchlistItems()

              // Update timing trackers
              const now = Date.now()
              this.lastSuccessfulSyncTime = now
              this.lastQueueItemTime = now

              this.log.info('Periodic reconciliation completed successfully')
            } finally {
              this.isRefreshing = false
              this.isProcessingWorkflow = false

              // Always reschedule for +20 minutes after sync completion
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

            // Get user details
            const user = await this.dbService.getUser(numericUserId)
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
   * Schedule the next periodic reconciliation to run in 20 minutes
   */
  private async schedulePendingReconciliation(): Promise<void> {
    try {
      const scheduleTime = new Date(Date.now() + 20 * 60 * 1000) // +20 minutes

      await this.fastify.scheduler.updateJobSchedule(
        this.MANUAL_SYNC_JOB_NAME,
        {
          minutes: 20,
          runImmediately: false,
        },
        true,
      )

      this.log.info(
        `Scheduled next periodic reconciliation for ${scheduleTime.toISOString()}`,
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
