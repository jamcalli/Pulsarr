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

/** Represents the current state of the watchlist workflow */
type WorkflowStatus = 'stopped' | 'running' | 'starting' | 'stopping'

export class WatchlistWorkflowService {
  /** Current workflow status */
  private status: WorkflowStatus = 'stopped'

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
   * Start the watchlist workflow
   *
   * Initializes connections to Plex, fetches watchlists, sets up RSS feeds,
   * and starts the monitoring intervals.
   *
   * @returns Promise resolving to true if started successfully, false otherwise
   */
  async startWorkflow(): Promise<boolean> {
    if (this.status !== 'stopped') {
      this.log.warn(`Workflow already ${this.status}, skipping start`)
      return false
    }

    this.log.info('Starting Watchlist Workflow Service...')
    this.status = 'starting'

    try {
      // Verify Plex connectivity
      await this.plexService.pingPlex()
      this.log.info('Plex connection verified')

      // Fetch initial watchlists
      await this.fetchWatchlists()

      // Sync existing watchlist items
      await this.syncWatchlistItems()

      // Generate and save RSS feeds
      const rssFeeds = await this.plexService.generateAndSaveRssFeeds()
      if ('error' in rssFeeds) {
        throw new Error(`Failed to generate RSS feeds: ${rssFeeds.error}`)
      }

      // Initialize RSS snapshots
      await this.initializeRssSnapshots()

      // Start monitoring processes
      this.startRssCheck()
      this.startQueueProcessor()

      // Update status
      this.status = 'running'
      this.isRunning = true
      this.log.info('Watchlist workflow running')

      return true
    } catch (error) {
      this.status = 'stopped'
      this.isRunning = false
      this.log.error('Error in Watchlist workflow:', error)
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

    // Clear any pending changes
    this.changeQueue.clear()

    // Update status
    this.isRunning = false
    this.status = 'stopped'

    return true
  }

  /**
   * Fetch all watchlists (self and friends)
   *
   * Refreshes the local copy of watchlists and updates show/movie statuses.
   */
  async fetchWatchlists(): Promise<void> {
    this.log.info('Refreshing watchlists')

    try {
      // Fetch both self and friends watchlists in parallel
      await Promise.all([
        this.plexService.getSelfWatchlist(),
        this.plexService.getOthersWatchlists(),
      ])

      this.log.info('Watchlists refreshed successfully')

      // Sync statuses with Sonarr/Radarr
      const { shows, movies } = await this.showStatusService.syncAllStatuses()
      this.log.info(
        `Updated ${shows} show statuses and ${movies} movie statuses after watchlist refresh`,
      )
    } catch (error) {
      this.log.error('Error refreshing watchlists:', error)
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
      if (item.guids && item.guids.length > 0) {
        itemMap.set(item.guids[0], item)
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
        this.log.warn(
          'Self RSS feed is empty, treating as an error condition and skipping processing',
        )
        return // Skip processing this cycle entirely
      }

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

        return
      }

      // Both current and previous feeds are valid, proceed with normal change detection
      const currentItems = this.createItemMap(currentWatchlist)
      const changes = this.detectChanges(this.previousSelfItems, currentItems)
      if (changes.size > 0) {
        await this.addToQueue(changes, 'self')
      }
      this.previousSelfItems = currentItems
    }

    // Process friends RSS feed
    if (results.friends.users[0]?.watchlist) {
      const currentWatchlist = results.friends.users[0].watchlist
      const isFeedEmpty = currentWatchlist.length === 0

      if (isFeedEmpty) {
        this.log.warn(
          'Friends RSS feed is empty, treating as an error condition and skipping processing',
        )
        return // Skip processing this cycle entirely
      }

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

        return
      }

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
        // Check for modifications
        const hasChanged =
          previousItem.title !== currentItem.title ||
          previousItem.type !== currentItem.type ||
          previousItem.thumb !== currentItem.thumb ||
          JSON.stringify(previousItem.genres) !==
            JSON.stringify(currentItem.genres)

        if (hasChanged) {
          this.log.debug('Modified item detected', {
            guid,
            title: currentItem.title,
            changes: {
              title: previousItem.title !== currentItem.title,
              type: previousItem.type !== currentItem.type,
              thumb: previousItem.thumb !== currentItem.thumb,
              genres:
                JSON.stringify(previousItem.genres) !==
                JSON.stringify(currentItem.genres),
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
      guids: item.guids,
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

    // Check if any users have sync disabled
    const hasUsersWithSyncDisabled =
      await this.dbService.hasUsersWithSyncDisabled()

    if (hasUsersWithSyncDisabled) {
      this.log.info(
        'Some users have sync disabled - deferring item processing to reconciliation phase',
      )
    }

    // Process each item
    for (const item of items) {
      if (!this.changeQueue.has(item)) {
        this.changeQueue.add(item)
        hasNewItems = true

        // Only process immediately if all users have sync enabled
        if (!hasUsersWithSyncDisabled) {
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
      if (!item.guids || item.guids.length === 0) {
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
      if (!item.guids || item.guids.length === 0) {
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
   * and routes it to the appropriate Radarr instance.
   *
   * @param item - Movie watchlist item to process
   * @returns Promise resolving to true if processed successfully
   */
  private async processRadarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      // Find TMDB ID
      const tmdbGuid = Array.isArray(item.guids)
        ? item.guids.find((guid) => guid.startsWith('tmdb:'))
        : undefined

      if (!tmdbGuid) {
        this.log.warn(
          `Movie ${item.title} has no TMDB ID, skipping Radarr processing`,
          {
            guids: item.guids,
          },
        )
        return false
      }

      // Parse TMDB ID
      const tmdbId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
      if (Number.isNaN(tmdbId)) {
        throw new Error('Invalid TMDB ID format')
      }

      // Verify item isn't already in Radarr
      const shouldAdd = await this.verifyRadarrItem(item)
      if (!shouldAdd) {
        return true // Item exists, considered successfully processed
      }

      // Prepare item for Radarr
      const radarrItem: RadarrItem = {
        title: `TMDB:${tmdbId}`,
        guids: [tmdbGuid],
        type: 'movie',
        genres: Array.isArray(item.genres)
          ? item.genres
          : typeof item.genres === 'string'
            ? [item.genres]
            : [],
      }

      // Add to Radarr
      await this.radarrManager.routeItemToRadarr(radarrItem, item.key)
      this.log.info(
        `Successfully added movie ${item.title} to appropriate Radarr instance`,
      )

      return true
    } catch (error) {
      this.log.error(`Error processing movie ${item.title} in Radarr:`, error)
      this.log.debug('Failed item details:', {
        title: item.title,
        guids: item.guids,
        type: item.type,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }

  /**
   * Process a show watchlist item and add it to Sonarr
   *
   * Extracts the TVDB ID, verifies the item doesn't already exist,
   * and routes it to the appropriate Sonarr instance.
   *
   * @param item - Show watchlist item to process
   * @returns Promise resolving to true if processed successfully
   */
  private async processSonarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      // Find TVDB ID
      const tvdbGuid = Array.isArray(item.guids)
        ? item.guids.find((guid) => guid.startsWith('tvdb:'))
        : undefined

      if (!tvdbGuid) {
        this.log.warn(
          `Show ${item.title} has no TVDB ID, skipping Sonarr processing`,
          {
            guids: item.guids,
          },
        )
        return false
      }

      // Parse TVDB ID
      const tvdbId = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
      if (Number.isNaN(tvdbId)) {
        throw new Error('Invalid TVDB ID format')
      }

      // Verify item isn't already in Sonarr
      const shouldAdd = await this.verifySonarrItem(item)
      if (!shouldAdd) {
        return true // Item exists, considered successfully processed
      }

      // Prepare item for Sonarr
      const sonarrItem: SonarrItem = {
        title: `TVDB:${tvdbId}`,
        guids: [tvdbGuid],
        type: 'show',
        ended: false,
        genres: Array.isArray(item.genres)
          ? item.genres
          : typeof item.genres === 'string'
            ? [item.genres]
            : [],
        status: 'pending',
        series_status: 'continuing', // Default to continuing since we don't know yet
      }

      // Add to Sonarr
      await this.sonarrManager.routeItemToSonarr(sonarrItem, item.key)
      this.log.info(
        `Successfully added show ${item.title} to appropriate Sonarr instance`,
      )

      return true
    } catch (error) {
      this.log.error(`Error processing show ${item.title} in Sonarr:`, error)
      this.log.debug('Failed item details:', {
        title: item.title,
        guids: item.guids,
        type: item.type,
        error: error instanceof Error ? error.message : error,
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
        allWatchlistItems.flatMap((item) =>
          typeof item.guids === 'string'
            ? JSON.parse(item.guids)
            : item.guids || [],
        ),
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
          guids:
            typeof item.guids === 'string'
              ? JSON.parse(item.guids)
              : item.guids,
          genres:
            typeof item.genres === 'string'
              ? JSON.parse(item.genres)
              : item.genres,
          key: item.key,
        }

        // Process shows
        if (item.type === 'show') {
          // Check for TVDB ID
          const tvdbGuids = Array.isArray(tempItem.guids)
            ? tempItem.guids.filter((guid) => guid.startsWith('tvdb:'))
            : []

          if (tvdbGuids.length === 0) {
            this.log.warn(
              `Show ${tempItem.title} has no TVDB ID, skipping Sonarr processing`,
              { guids: tempItem.guids },
            )
            skippedDueToMissingIds++
            continue
          }

          // Check if show exists
          const exists = [...existingSeries].some((series) =>
            series.guids.some((existingGuid) =>
              tempItem.guids?.includes(existingGuid),
            ),
          )

          // Add to Sonarr if not exists
          if (!exists) {
            await this.processSonarrItem(tempItem)
            showsAdded++
          }
        }
        // Process movies
        else if (item.type === 'movie') {
          // Check for TMDB ID
          const tmdbGuids = Array.isArray(tempItem.guids)
            ? tempItem.guids.filter((guid) => guid.startsWith('tmdb:'))
            : []

          if (tmdbGuids.length === 0) {
            this.log.warn(
              `Movie ${tempItem.title} has no TMDB ID, skipping Radarr processing`,
              { guids: tempItem.guids },
            )
            skippedDueToMissingIds++
            continue
          }

          // Check if movie exists
          const exists = [...existingMovies].some((movie) =>
            movie.guids.some((existingGuid) =>
              tempItem.guids?.includes(existingGuid),
            ),
          )

          // Add to Radarr if not exists
          if (!exists) {
            await this.processRadarrItem(tempItem)
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
      this.log.error('Error during watchlist sync:', error)
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
            'Queue process delay reached, checking sync requirements',
          )
          this.changeQueue.clear()

          // Check if any users have sync disabled
          const hasUsersWithSyncDisabled =
            await this.dbService.hasUsersWithSyncDisabled()

          if (hasUsersWithSyncDisabled) {
            this.log.info(
              'Some users have sync disabled - performing full sync reconciliation',
            )
            // First refresh the watchlists
            await this.fetchWatchlists()
            // Then run full sync check
            await this.syncWatchlistItems()
          } else {
            this.log.info(
              'All users have sync enabled - performing standard watchlist refresh',
            )
            await this.fetchWatchlists()
          }

          this.log.info(`Queue processing completed for ${queueSize} items`)
        } catch (error) {
          this.status = 'stopped'
          this.isRunning = false
          this.log.error('Error in Watchlist workflow:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            details: error,
          })
          throw error
        } finally {
          this.isRefreshing = false
        }
      }
    }, 10000) // Check every 10 seconds
  }
}
