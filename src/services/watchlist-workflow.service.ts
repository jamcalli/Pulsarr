import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type {
  TemptRssWatchlistItem,
  RssWatchlistResults,
  WatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
type WorkflowStatus = 'stopped' | 'running' | 'starting' | 'stopping'
export class WatchlistWorkflowService {
  private status: WorkflowStatus = 'stopped'
  private rssCheckInterval: NodeJS.Timeout | null = null
  private queueCheckInterval: NodeJS.Timeout | null = null
  private lastQueueItemTime: number = Date.now()
  private changeQueue: Set<TemptRssWatchlistItem> = new Set()
  private previousSelfItems: Map<string, WatchlistItem> = new Map()
  private previousFriendsItems: Map<string, WatchlistItem> = new Map()
  private isRefreshing = false
  private isRunning = false
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly rssCheckIntervalMs: number = 10000,
    private readonly queueProcessDelayMs: number = 60000,
  ) {
    this.log.info('Initializing Watchlist Workflow Service')
  }
  private get config() {
    return this.fastify.config
  }
  private get plexService() {
    return this.fastify.plexWatchlist
  }
  private get sonarrManager() {
    return this.fastify.sonarrManager
  }
  private get radarrManager() {
    return this.fastify.radarrManager
  }
  private get dbService() {
    return this.fastify.db
  }
  private get showStatusService() {
    return this.fastify.sync
  }
  getStatus(): WorkflowStatus {
    return this.status
  }
  async startWorkflow() {
    if (this.status !== 'stopped') {
      this.log.warn(`Workflow already ${this.status}, skipping start`)
      return false
    }
    this.log.info('Starting Watchlist Workflow Service...')
    this.status = 'starting'
    try {
      await this.plexService.pingPlex()
      this.log.info('Plex connection verified')
      await this.fetchWatchlists()
      await this.syncWatchlistItems()
      const rssFeeds = await this.plexService.generateAndSaveRssFeeds()
      if ('error' in rssFeeds) {
        throw new Error(`Failed to generate RSS feeds: ${rssFeeds.error}`)
      }
      await this.initializeRssSnapshots()
      this.startRssCheck()
      this.startQueueProcessor()
      this.status = 'running'
      this.isRunning = true
      this.log.info('Watchlist testing workflow running')
      return true
    } catch (error) {
      this.status = 'stopped'
      this.isRunning = false
      this.log.error('Error in Watchlist testing workflow:', error)
      throw error
    }
  }
  async stop() {
    if (this.status !== 'running' && this.status !== 'starting') {
      this.log.warn(`Cannot stop workflow: current status is ${this.status}`)
      return false
    }
    this.log.info('Stopping Watchlist testing workflow')
    this.status = 'stopping'
    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
      this.rssCheckInterval = null
    }
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval)
      this.queueCheckInterval = null
    }
    this.changeQueue.clear()
    this.isRunning = false
    this.status = 'stopped'
    return true
  }
  async fetchWatchlists() {
    this.log.info('Refreshing watchlists')
    try {
      await Promise.all([
        this.plexService.getSelfWatchlist(),
        this.plexService.getOthersWatchlists(),
      ])
      this.log.info('Watchlists refreshed successfully')
      const { shows, movies } = await this.showStatusService.syncAllStatuses()
      this.log.info(
        `Updated ${shows} show statuses and ${movies} movie statuses after watchlist refresh`,
      )
    } catch (error) {
      this.log.error('Error refreshing watchlists:', error)
      throw error
    }
  }
  private async initializeRssSnapshots() {
    this.log.info('Initializing RSS snapshots')
    const results = await this.plexService.processRssWatchlists()
    if (results.self.users[0]?.watchlist) {
      this.previousSelfItems = this.createItemMap(
        results.self.users[0].watchlist,
      )
      this.log.info('Initialized self RSS snapshot', {
        itemCount: this.previousSelfItems.size,
      })
    }
    if (results.friends.users[0]?.watchlist) {
      this.previousFriendsItems = this.createItemMap(
        results.friends.users[0].watchlist,
      )
      this.log.info('Initialized friends RSS snapshot', {
        itemCount: this.previousFriendsItems.size,
      })
    }
  }
  private createItemMap(items: WatchlistItem[]): Map<string, WatchlistItem> {
    const itemMap = new Map<string, WatchlistItem>()
    for (const item of items) {
      if (item.guids && item.guids.length > 0) {
        itemMap.set(item.guids[0], item)
      }
    }
    return itemMap
  }
  private startRssCheck() {
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
  private async processRssResults(results: RssWatchlistResults) {
    if (results.self.users[0]?.watchlist) {
      const currentItems = this.createItemMap(results.self.users[0].watchlist)
      const changes = this.detectChanges(this.previousSelfItems, currentItems)
      if (changes.size > 0) {
        await this.addToQueue(changes, 'self')
      }
      this.previousSelfItems = currentItems
    }
    if (results.friends.users[0]?.watchlist) {
      const currentItems = this.createItemMap(
        results.friends.users[0].watchlist,
      )
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
  private detectChanges(
    previousItems: Map<string, WatchlistItem>,
    currentItems: Map<string, WatchlistItem>,
  ): Set<TemptRssWatchlistItem> {
    const changes = new Set<TemptRssWatchlistItem>()
    currentItems.forEach((currentItem, guid) => {
      const previousItem = previousItems.get(guid)
      if (!previousItem) {
        this.log.debug('New item detected', { guid, title: currentItem.title })
        changes.add(this.convertToTempItem(currentItem))
      } else {
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
    previousItems.forEach((item, guid) => {
      if (!currentItems.has(guid)) {
        this.log.debug('Removed item detected', { guid, title: item.title })
      }
    })
    if (changes.size > 0) {
      this.log.info('Detected RSS feed changes', {
        changedItemsCount: changes.size,
        previousItemsCount: previousItems.size,
        currentItemsCount: currentItems.size,
      })
    }
    return changes
  }
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
  private async addToQueue(
    items: Set<TemptRssWatchlistItem>,
    source: 'self' | 'friends',
  ) {
    let hasNewItems = false
    // Check if any users have sync disabled
    const hasUsersWithSyncDisabled =
      await this.dbService.hasUsersWithSyncDisabled()
    if (hasUsersWithSyncDisabled) {
      this.log.info(
        'Some users have sync disabled - deferring item processing to reconciliation phase',
      )
    }
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
  private async verifySonarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      if (!item.guids || item.guids.length === 0) {
        this.log.warn(`Show ${item.title} has no GUIDs to verify against`)
        return false
      }
      // Get all instances from the manager service
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
  private async verifyRadarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
      if (!item.guids || item.guids.length === 0) {
        this.log.warn(`Movie ${item.title} has no GUIDs to verify against`)
        return false
      }
      // Get all instances from the manager service
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
  private async processRadarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
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
        return false // Return false to indicate item was skipped due to missing ID
      }
      const tmdbId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
      if (Number.isNaN(tmdbId)) {
        throw new Error('Invalid TMDB ID format')
      }
      const shouldAdd = await this.verifyRadarrItem(item)
      if (!shouldAdd) {
        return true // Return true to indicate item was processed but not added (exists)
      }
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
      await this.radarrManager.routeItemToRadarr(radarrItem, item.key)
      this.log.info(
        `Successfully added movie ${item.title} to appropriate Radarr instance`,
      )
      return true // Return true to indicate successful processing
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
  private async processSonarrItem(
    item: TemptRssWatchlistItem,
  ): Promise<boolean> {
    try {
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
        return false // Return false to indicate item was skipped due to missing ID
      }
      const tvdbId = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
      if (Number.isNaN(tvdbId)) {
        throw new Error('Invalid TVDB ID format')
      }
      const shouldAdd = await this.verifySonarrItem(item)
      if (!shouldAdd) {
        return true // Return true to indicate item was processed but not added (exists)
      }
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
        // added will be set by Sonarr
      }
      await this.sonarrManager.routeItemToSonarr(sonarrItem, item.key)
      this.log.info(
        `Successfully added show ${item.title} to appropriate Sonarr instance`,
      )
      return true // Return true to indicate successful processing
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
  private async syncWatchlistItems() {
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

      // Get all shows and movies
      const [shows, movies] = await Promise.all([
        this.dbService.getAllShowWatchlistItems(),
        this.dbService.getAllMovieWatchlistItems(),
      ])
      const allWatchlistItems = [...shows, ...movies]
      const [existingSeries, existingMovies] = await Promise.all([
        this.sonarrManager.fetchAllSeries(),
        this.radarrManager.fetchAllMovies(),
      ])
      // Stats to track
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
      // Check unmatched items in Sonarr/Radarr
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

      for (const item of allWatchlistItems) {
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

        const canSync = userSyncStatus.get(numericUserId)

        if (canSync === false) {
          this.log.debug(
            `Skipping item "${item.title}" during sync as user ${numericUserId} has sync disabled`,
          )
          skippedDueToUserSetting++
          continue
        }

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

        // Check for missing IDs before attempting to process
        if (item.type === 'show') {
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

          const exists = [...existingSeries].some((series) =>
            series.guids.some((existingGuid) =>
              tempItem.guids?.includes(existingGuid),
            ),
          )
          if (!exists) {
            await this.processSonarrItem(tempItem)
            showsAdded++
          }
        } else if (item.type === 'movie') {
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

          const exists = [...existingMovies].some((movie) =>
            movie.guids.some((existingGuid) =>
              tempItem.guids?.includes(existingGuid),
            ),
          )
          if (!exists) {
            await this.processRadarrItem(tempItem)
            moviesAdded++
          }
        }
      }

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

      if (unmatchedShows > 0 || unmatchedMovies > 0) {
        this.log.warn(
          `Found ${unmatchedShows} shows and ${unmatchedMovies} movies in Sonarr/Radarr that are not in watchlists`,
        )
      }

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
  private startQueueProcessor() {
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval)
    }
    this.queueCheckInterval = setInterval(async () => {
      if (this.isRefreshing) {
        return
      }
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
          this.log.error('Error in Watchlist testing workflow:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            details: error,
          })
          throw error
        } finally {
          this.isRefreshing = false
        }
      }
    }, 10000)
  }
}
