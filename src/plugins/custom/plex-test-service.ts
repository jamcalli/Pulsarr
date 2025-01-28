import type {
  FastifyPluginCallback,
  FastifyInstance,
  FastifyBaseLogger,
} from 'fastify'
import fp from 'fastify-plugin'
import type {
  TemptRssWatchlistItem,
  RssWatchlistResults,
  WatchlistItem,
} from '@root/types/plex.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'

class PlexTestingWorkflow {
  private rssCheckInterval: NodeJS.Timeout | null = null
  private queueCheckInterval: NodeJS.Timeout | null = null
  private lastQueueItemTime: number = Date.now()
  private changeQueue: Set<TemptRssWatchlistItem> = new Set()
  private previousSelfItems: Map<string, WatchlistItem> = new Map()
  private previousFriendsItems: Map<string, WatchlistItem> = new Map()
  private isRefreshing = false
  private isRunning = false

  constructor(
    private readonly plexService: FastifyInstance['plexWatchlist'],
    private readonly log: FastifyBaseLogger,
    private readonly sonarrService: FastifyInstance['sonarr'],
    private readonly radarrService: FastifyInstance['radarr'],
    private readonly fastify: FastifyInstance,
    private readonly dbService: FastifyInstance['db'],
    private readonly showStatusService: FastifyInstance['sync'],
  ) {}

  async startWorkflow() {
    if (this.isRunning) {
      this.log.warn('Workflow already running, skipping start')
      return
    }

    this.log.info('Starting Plex testing workflow')
    this.isRunning = true

    try {
      await this.plexService.pingPlex()
      this.log.info('Plex connection verified')

      await this.fetchWatchlists()
      await this.initialSyncCheck()

      const rssFeeds = await this.plexService.generateAndSaveRssFeeds()
      if ('error' in rssFeeds) {
        throw new Error(`Failed to generate RSS feeds: ${rssFeeds.error}`)
      }

      await this.initializeRssSnapshots()

      this.startRssCheck()
      this.startQueueProcessor()

      this.log.info('Plex testing workflow running')
    } catch (error) {
      this.isRunning = false
      this.log.error('Error in Plex testing workflow:', error)
      throw error
    }
  }

  async stop() {
    this.log.info('Stopping Plex testing workflow')
    this.isRunning = false

    if (this.rssCheckInterval) {
      clearInterval(this.rssCheckInterval)
      this.rssCheckInterval = null
    }

    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval)
      this.queueCheckInterval = null
    }

    this.changeQueue.clear()
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
    }, 10000)
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
      type: item.type,
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

    for (const item of items) {
      if (!this.changeQueue.has(item)) {
        this.changeQueue.add(item)
        hasNewItems = true

        if (item.type === 'SHOW') {
          this.log.info(`Processing show ${item.title} immediately`)
          await this.processSonarrItem(item)
        } else if (item.type === 'MOVIE') {
          this.log.info(`Processing movie ${item.title} immediately`)
          await this.processRadarrItem(item)
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

      const existingSeries = await this.sonarrService.fetchSeries()

      const exists = [...existingSeries].some((series) =>
        series.guids.some((existingGuid) => item.guids?.includes(existingGuid)),
      )

      if (exists) {
        this.log.info(
          `Show ${item.title} already exists in Sonarr, skipping addition`,
        )
        return false
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

      const existingMovies = await this.radarrService.fetchMovies()

      const exists = [...existingMovies].some((movie) =>
        movie.guids.some((existingGuid) => item.guids?.includes(existingGuid)),
      )

      if (exists) {
        this.log.info(
          `Movie ${item.title} already exists in Radarr, skipping addition`,
        )
        return false
      }

      return true
    } catch (error) {
      this.log.error(`Error verifying movie ${item.title} in Radarr:`, error)
      throw error
    }
  }

  private async processRadarrItem(item: TemptRssWatchlistItem) {
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
        return
      }

      const tmdbId = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
      if (Number.isNaN(tmdbId)) {
        throw new Error('Invalid TMDB ID format')
      }

      const shouldAdd = await this.verifyRadarrItem(item)
      if (!shouldAdd) {
        return
      }

      const radarrItem: RadarrItem = {
        title: `TMDB:${tmdbId}`,
        guids: [tmdbGuid],
        type: 'movie',
      }

      await this.radarrService.addToRadarr(radarrItem)
      this.log.info(`Successfully added movie ${item.title} to Radarr`)
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

  private async processSonarrItem(item: TemptRssWatchlistItem) {
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
        return
      }

      const tvdbId = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
      if (Number.isNaN(tvdbId)) {
        throw new Error('Invalid TVDB ID format')
      }

      const shouldAdd = await this.verifySonarrItem(item)
      if (!shouldAdd) {
        return
      }

      const sonarrItem: SonarrItem = {
        title: `TVDB:${tvdbId}`,
        guids: [tvdbGuid],
        type: 'show',
        ended: false,
      }

      await this.sonarrService.addToSonarr(sonarrItem)
      this.log.info(`Successfully added show ${item.title} to Sonarr`)
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

  private async initialSyncCheck() {
    this.log.info('Performing initial sync check')

    try {
      // Get all shows and movies
      const [shows, movies] = await Promise.all([
        this.dbService.getAllShowWatchlistItems(),
        this.dbService.getAllMovieWatchlistItems(),
      ])

      const allWatchlistItems = [...shows, ...movies]

      const [existingSeries, existingMovies] = await Promise.all([
        this.sonarrService.fetchSeries(),
        this.radarrService.fetchMovies(),
      ])

      let showsAdded = 0
      let moviesAdded = 0
      let unmatchedShows = 0
      let unmatchedMovies = 0
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

      // Process missing watchlist items
      for (const item of allWatchlistItems) {
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

        if (item.type === 'show') {
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

      this.log.info('Initial sync completed:', {
        added: {
          shows: showsAdded,
          movies: moviesAdded,
        },
        unmatched: {
          shows: unmatchedShows,
          movies: unmatchedMovies,
        },
      })

      if (unmatchedShows > 0 || unmatchedMovies > 0) {
        this.log.warn(
          `Found ${unmatchedShows} shows and ${unmatchedMovies} movies in Sonarr/Radarr that are not in watchlists`,
        )
      }
    } catch (error) {
      this.log.error('Error during initial sync:', error)
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

      if (timeSinceLastItem >= 60000 && this.changeQueue.size > 0) {
        this.isRefreshing = true
        try {
          this.log.info('One minute since last new item, refreshing watchlists')
          this.changeQueue.clear()
          await this.fetchWatchlists()
          this.log.info('Watchlist refresh completed')
        } catch (error) {
          this.log.error('Error during watchlist refresh:', error)
        } finally {
          this.isRefreshing = false
        }
      }
    }, 10000) // Check every 10 seconds
  }
}

const plexTestingPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  try {
    const workflow = new PlexTestingWorkflow(
      fastify.plexWatchlist,
      fastify.log,
      fastify.sonarr,
      fastify.radarr,
      fastify,
      fastify.db,
      fastify.sync,
    )

    fastify.addHook('onClose', async () => {
      await workflow.stop()
    })

    fastify.decorate('plexTestingWorkflow', workflow)

    // Start workflow with proper error handling
    const startWorkflow = async () => {
      try {
        fastify.log.info('Waiting for config to be ready...')
        await fastify.waitForConfig()
        fastify.log.info('Config ready, starting workflow')
        await workflow.startWorkflow()
      } catch (err) {
        fastify.log.error('Error in workflow startup:', err)
        throw err
      }
    }

    setImmediate(startWorkflow)

    done()
  } catch (err) {
    done(err as Error)
  }
}

export default fp(plexTestingPlugin, {
  name: 'plex-testing-plugin',
  dependencies: ['plex-watchlist', 'sonarr', 'radarr', 'sync', 'config'],
})
