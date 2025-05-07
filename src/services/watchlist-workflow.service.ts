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
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  TemptRssWatchlistItem,
  RssWatchlistResults,
  WatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { IntervalConfig } from '@root/types/scheduler.types.js'
import {
  parseGuids,
  hasMatchingGuids,
  extractTmdbId,
  extractTvdbId,
  extractTypedGuid,
} from '@utils/guid-handler.js'
import type { Condition, ConditionGroup } from '@root/types/router.types.js'

/** Represents the current state of the watchlist workflow */
type WorkflowStatus = 'stopped' | 'running' | 'starting' | 'stopping'

export class WatchlistWorkflowService {
  private readonly MANUAL_SYNC_JOB_NAME = 'manual-watchlist-sync'
  /** Current workflow status */
  private status: WorkflowStatus = 'stopped'

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

  /** Flag to track if the workflow is actually running (may differ from status) */
  private isRunning = false

  /** Flag to indicate if using RSS fallback */
  private isUsingRssFallback = false

  /**
   * Creates a new WatchlistWorkflowService instance
   *
   * @param log - Fastify logger instance for recording workflow operations
   * @param fastify - Fastify instance for accessing other services
   * @param rssCheckIntervalMs - Interval in ms between RSS feed checks
   * @param queueProcessDelayMs - Delay in ms before processing queued items
   */
  constructor(
    private readonly log: FastifyBaseLogger,
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
      this.isRunning = false

      this.log.debug('Starting watchlist workflow initialization')

      // Clean up any existing manual sync jobs from previous runs
      try {
        this.log.debug('Cleaning up existing manual sync jobs')
        await this.cleanupExistingManualSync()
      } catch (cleanupError) {
        this.log.warn(
          'Error during cleanup of existing manual sync jobs (non-fatal)',
          { error: cleanupError },
        )
        // Continue despite this error
      }

      // Verify Plex connectivity
      try {
        this.log.debug('Verifying Plex connectivity')
        await this.plexService.pingPlex()
        this.log.info('Plex connection verified')
      } catch (plexError) {
        this.log.error('Failed to verify Plex connectivity', {
          error: plexError,
        })
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
            'Failed to generate RSS feeds, falling back to manual sync',
            { error: rssFeeds.error },
          )
          await this.setupManualSyncFallback()
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
        this.log.error('Error generating or initializing RSS feeds', {
          error: rssError,
        })
        throw new Error('Failed to generate or initialize RSS feeds', {
          cause: rssError,
        })
      }

      // Initial sync regardless of method
      try {
        this.log.debug('Starting initial watchlist fetch')
        await this.fetchWatchlists()

        this.log.debug('Starting initial watchlist item sync')
        await this.syncWatchlistItems()
      } catch (syncError) {
        this.log.error('Error during initial watchlist synchronization', {
          error: syncError,
          errorMessage:
            syncError instanceof Error ? syncError.message : String(syncError),
          errorStack: syncError instanceof Error ? syncError.stack : undefined,
        })
        throw new Error('Failed during initial watchlist synchronization', {
          cause: syncError,
        })
      }

      // Start queue processor
      this.log.debug('Starting queue processor')
      this.startQueueProcessor()

      // Update status to running after everything is initialized
      this.status = 'running'
      this.isRunning = true
      this.initialized = true

      // Set the RSS mode flag based on whether we're using RSS fallback
      this.rssMode = !this.isUsingRssFallback

      this.log.info(
        `Watchlist workflow running in ${this.isUsingRssFallback ? 'manual sync' : 'RSS'} mode`,
      )

      return true
    } catch (error) {
      this.status = 'stopped'
      this.isRunning = false
      this.initialized = false
      this.rssMode = false

      // Enhanced error logging
      this.log.error('Error in Watchlist workflow:', {
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
      })

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

    if (this.isUsingRssFallback) {
      try {
        await this.cleanupExistingManualSync()
      } catch (error) {
        this.log.error('Error cleaning up manual sync during shutdown:', error)
      }
    }

    // Clear any pending changes
    this.changeQueue.clear()

    // Update status
    this.isRunning = false
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

    try {
      // Fetch both self and friends watchlists in parallel
      const fetchResults = await Promise.allSettled([
        // Self watchlist promise
        (async () => {
          try {
            this.log.debug('Fetching self watchlist')
            return await this.plexService.getSelfWatchlist()
          } catch (selfError) {
            this.log.error('Error refreshing self watchlist:', {
              error: selfError,
              errorMessage:
                selfError instanceof Error
                  ? selfError.message
                  : String(selfError),
              errorStack:
                selfError instanceof Error ? selfError.stack : undefined,
            })
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
            this.log.error('Error refreshing friends watchlists:', {
              error: friendsError,
              errorMessage:
                friendsError instanceof Error
                  ? friendsError.message
                  : String(friendsError),
              errorStack:
                friendsError instanceof Error ? friendsError.stack : undefined,
            })
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
        this.log.info(
          `Updated ${shows} show statuses and ${movies} movie statuses after watchlist refresh`,
        )
      } catch (error) {
        this.log.warn('Error syncing statuses (non-fatal):', error)
        // Continue despite this error
      }
    } catch (error) {
      this.log.error('Error refreshing watchlists:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
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
      this.log.info('Initialized self RSS snapshot', {
        itemCount: this.previousSelfItems.size,
      })
    }

    // Process friends watchlist
    if (results.friends.users[0]?.watchlist) {
      this.previousFriendsItems = this.createItemMap(
        results.friends.users[0].watchlist,
      )
      this.log.info('Initialized friends RSS snapshot', {
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
        this.log.error('Error checking RSS feeds:', error)
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
        this.log.debug('New item detected', { guid, title: currentItem.title })
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
          this.log.debug('Modified item detected', {
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
        this.log.debug('Removed item detected', { guid, title: item.title })
      }
    })

    // Log summary if changes were detected
    if (changes.size > 0) {
      this.log.info('Detected RSS feed changes', {
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
          this.log.info(
            `Queuing ${item.type} ${item.title} for later processing during reconciliation`,
          )
        }
      }
    }

    // Store items and update timestamp if new items were added
    if (hasNewItems) {
      this.lastQueueItemTime = Date.now()
      this.log.info(
        `Added ${items.size} changed items to queue from ${source} RSS feed`,
      )

      try {
        await this.plexService.storeRssWatchlistItems(items, source)
        this.log.info(`Stored ${items.size} changed ${source} RSS items`)
      } catch (error) {
        this.log.error(`Error storing ${source} RSS items:`, error)
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
      const parsedGuids = parseGuids(item.guids)
      if (parsedGuids.length === 0) {
        this.log.warn(`Show ${item.title} has no GUIDs to verify against`)
        return false
      }

      // Get all Sonarr instances
      const instances = await this.sonarrManager.getAllInstances()

      // Check each instance for the show
      for (const instance of instances) {
        const exists = await this.sonarrManager.verifyItemExists(
          instance.id,
          item,
        )

        if (exists) {
          this.log.info(
            `Show ${item.title} already exists in Sonarr instance ${instance.name}, skipping addition`,
          )
          return false
        }
      }

      return true
    } catch (error) {
      this.log.error(`Error verifying show ${item.title} in Sonarr:`, error)
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
      const parsedGuids = parseGuids(item.guids)
      if (parsedGuids.length === 0) {
        this.log.warn(`Movie ${item.title} has no GUIDs to verify against`)
        return false
      }

      // Get all Radarr instances
      const instances = await this.radarrManager.getAllInstances()

      // Check each instance for the movie
      for (const instance of instances) {
        const exists = await this.radarrManager.verifyItemExists(
          instance.id,
          item,
        )

        if (exists) {
          this.log.info(
            `Movie ${item.title} already exists in Radarr instance ${instance.name}, skipping addition`,
          )
          return false
        }
      }

      return true
    } catch (error) {
      this.log.error(`Error verifying movie ${item.title} in Radarr:`, error)
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
          `Movie ${item.title} has no valid TMDB ID, skipping Radarr processing`,
          {
            guids: item.guids,
          },
        )
        return false
      }

      // Verify item isn't already in Radarr
      const shouldAdd = await this.verifyRadarrItem(item)
      if (!shouldAdd) {
        return true // Item exists, considered successfully processed
      }

      // Get the tmdbGuid string using extractTypedGuid
      const tmdbGuid = extractTypedGuid(item.guids, 'tmdb:') || `tmdb:${tmdbId}`

      // Prepare item for Radarr
      const radarrItem: RadarrItem = {
        title: `TMDB:${tmdbId}`,
        guids: [tmdbGuid],
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
      this.log.error(`Error processing movie ${item.title}:`, {
        error,
        details: {
          title: item.title,
          guids: item.guids,
          type: item.type,
        },
      })
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
          `Show ${item.title} has no valid TVDB ID, skipping Sonarr processing`,
          {
            guids: item.guids,
          },
        )
        return false
      }

      // Verify item isn't already in Sonarr
      const shouldAdd = await this.verifySonarrItem(item)
      if (!shouldAdd) {
        return true // Item exists, considered successfully processed
      }

      // Get the tvdbGuid string using extractTypedGuid
      const tvdbGuid = extractTypedGuid(item.guids, 'tvdb:') || `tvdb:${tvdbId}`

      // Prepare item for Sonarr
      const sonarrItem: SonarrItem = {
        title: `TVDB:${tvdbId}`,
        guids: [tvdbGuid],
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
      this.log.error(`Error processing show ${item.title} in Sonarr:`, {
        error,
        details: {
          title: item.title,
          guids: item.guids,
          type: item.type,
        },
      })
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

      // Create a set of all watchlist GUIDs for fast lookup
      const watchlistGuids = new Set(
        allWatchlistItems.flatMap((item) => parseGuids(item.guids)),
      )

      // Check unmatched items in Sonarr/Radarr (for reporting purposes)
      for (const series of existingSeries) {
        const hasMatch = series.guids.some((guid) => watchlistGuids.has(guid))
        if (!hasMatch) {
          unmatchedShows++
          this.log.debug('Show in Sonarr not in watchlist:', {
            title: series.title,
            guids: series.guids,
          })
        }
      }

      for (const movie of existingMovies) {
        const hasMatch = movie.guids.some((guid) => watchlistGuids.has(guid))
        if (!hasMatch) {
          unmatchedMovies++
          this.log.debug('Movie in Radarr not in watchlist:', {
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
            this.log.warn(
              `Show ${tempItem.title} has no TVDB ID, skipping Sonarr processing`,
              { guids: tempItem.guids },
            )
            skippedDueToMissingIds++
            continue
          }

          // Check if show exists using hasMatchingGuids
          const exists = existingSeries.some((series) =>
            hasMatchingGuids(series.guids, tempItem.guids),
          )

          // Add to Sonarr if not exists
          if (!exists) {
            // Get the tvdbGuid string using extractTypedGuid
            const tvdbGuid =
              extractTypedGuid(tempItem.guids, 'tvdb:') || `tvdb:${tvdbId}`

            const sonarrItem: SonarrItem = {
              title: `TVDB:${tvdbId}`,
              guids: [tvdbGuid],
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
            this.log.warn(
              `Movie ${tempItem.title} has no TMDB ID, skipping Radarr processing`,
              { guids: tempItem.guids },
            )
            skippedDueToMissingIds++
            continue
          }

          // Check if movie exists using hasMatchingGuids
          const exists = existingMovies.some((movie) =>
            hasMatchingGuids(movie.guids, tempItem.guids),
          )

          // Add to Radarr if not exists
          if (!exists) {
            // Get the tmdbGuid string using extractTypedGuid
            const tmdbGuid =
              extractTypedGuid(tempItem.guids, 'tmdb:') || `tmdb:${tmdbId}`

            const radarrItem: RadarrItem = {
              title: `TMDB:${tmdbId}`,
              guids: [tmdbGuid],
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

      // Log warnings about unmatched items
      if (unmatchedShows > 0 || unmatchedMovies > 0) {
        this.log.warn(
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
        this.log.info(
          `Skipped ${skippedDueToMissingIds} items due to missing required IDs (TVDB/TMDB)`,
        )
      }
    } catch (error) {
      this.log.error('Error during watchlist sync:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
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
      // Avoid concurrent processing
      if (this.isRefreshing) {
        return
      }

      // Check if enough time has passed and there are items to process
      const timeSinceLastItem = Date.now() - this.lastQueueItemTime
      if (
        timeSinceLastItem >= this.queueProcessDelayMs &&
        this.changeQueue.size > 0
      ) {
        this.isRefreshing = true

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
          } else {
            this.log.info('Performing standard watchlist refresh')
            await this.fetchWatchlists()
          }

          this.log.info(`Queue processing completed for ${queueSize} items`)
        } catch (error) {
          this.status = 'stopped'
          this.isRunning = false
          this.log.error('Error in queue processing:', {
            error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          })
          throw error
        } finally {
          this.isRefreshing = false
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

    // Check if any user-related routing rules exist
    const conditionalRules =
      await this.fastify.db.getRouterRulesByType('conditional')
    const hasUserRoutingRules = conditionalRules.some((rule) => {
      const criteria = rule.criteria?.condition as
        | Condition
        | ConditionGroup
        | undefined
      return this.hasUserField(criteria)
    })

    return hasUsersWithSyncDisabled || hasUserRoutingRules
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
      } catch (e) {
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

  private async setupManualSyncFallback(): Promise<void> {
    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
      this.rssCheckInterval = null
    }

    try {
      await this.fastify.scheduler.scheduleJob(
        this.MANUAL_SYNC_JOB_NAME,
        async (jobName: string) => {
          try {
            this.log.info('Starting manual watchlist reconciliation')
            await this.fetchWatchlists()
            await this.syncWatchlistItems()
            this.log.info('Manual watchlist reconciliation completed')
          } catch (error) {
            this.log.error('Error in manual watchlist reconciliation:', {
              error,
              errorMessage:
                error instanceof Error ? error.message : String(error),
            })
          }
        },
      )

      await this.fastify.scheduler.updateJobSchedule(
        this.MANUAL_SYNC_JOB_NAME,
        {
          minutes: 20,
        } as IntervalConfig,
        true,
      )

      this.log.info('Manual sync reconciliation scheduled for every 20 minutes')
    } catch (error) {
      this.log.error('Error setting up manual sync fallback:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
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
          'Found existing manual sync job from previous run, cleaning up',
        )
        await this.fastify.scheduler.unscheduleJob(this.MANUAL_SYNC_JOB_NAME)
        await this.fastify.db.deleteSchedule(this.MANUAL_SYNC_JOB_NAME)
        this.log.info('Successfully cleaned up existing manual sync job')
      }
    } catch (error) {
      this.log.error('Error cleaning up existing manual sync job:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
