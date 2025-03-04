import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { DatabaseWatchlistItem } from '@root/types/watchlist-status.types.js'

export class StatusService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly dbService: FastifyInstance['db'],
    private readonly sonarrManager: FastifyInstance['sonarrManager'],
    private readonly radarrManager: FastifyInstance['radarrManager'],
  ) {}

  async syncAllStatuses(): Promise<{ shows: number; movies: number }> {
    const [showUpdates, movieUpdates] = await Promise.all([
      this.syncSonarrStatuses(),
      this.syncRadarrStatuses(),
    ])
    return { shows: showUpdates, movies: movieUpdates }
  }

  async syncSonarrStatuses(): Promise<number> {
    try {
      const existingSeries = await this.sonarrManager.fetchAllSeries()
      const watchlistItems = await this.dbService.getAllShowWatchlistItems()
      const updates = this.processShowStatusUpdates(
        existingSeries,
        watchlistItems,
      )
      if (updates.length > 0) {
        return await this.dbService.bulkUpdateWatchlistItems(updates)
      }
      return 0
    } catch (error) {
      this.log.error('Error syncing Sonarr statuses:', error)
      throw error
    }
  }

  async syncRadarrStatuses(): Promise<number> {
    try {
      const existingMovies = await this.radarrManager.fetchAllMovies()
      const watchlistItems = await this.dbService.getAllMovieWatchlistItems()
      const updates = this.processMovieStatusUpdates(
        existingMovies,
        watchlistItems,
      )
      if (updates.length > 0) {
        return await this.dbService.bulkUpdateWatchlistItems(updates)
      }
      return 0
    } catch (error) {
      this.log.error('Error syncing Radarr statuses:', error)
      throw error
    }
  }

  private processShowStatusUpdates(
    sonarrItems: SonarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ) {
    const updates: Array<{
      userId: number
      key: string
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      series_status?: 'continuing' | 'ended'
      sonarr_instance_id?: number
    }> = []
    
    for (const item of watchlistItems) {
      const sonarrMatch = this.findMatch(sonarrItems, item.guids)
      if (sonarrMatch) {
        const instanceId = sonarrMatch.sonarr_instance_id || undefined
        
        const update: {
          userId: number
          key: string
          added?: string
          status?: 'pending' | 'requested' | 'grabbed' | 'notified'
          series_status?: 'continuing' | 'ended'
          sonarr_instance_id?: number
        } = {
          userId: item.user_id,
          key: item.key,
        }
        
        if (item.added !== sonarrMatch.added) {
          update.added = sonarrMatch.added
        }
        
        if (item.status !== sonarrMatch.status) {
          if (item.status !== 'notified') {
            update.status = sonarrMatch.status
          } else {
            this.log.debug(`Preventing status downgrade for show ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${sonarrMatch.status}'`)
          }
        }
        
        if (item.series_status !== sonarrMatch.series_status) {
          update.series_status = sonarrMatch.series_status
        }
        
        if (item.sonarr_instance_id !== instanceId) {
          update.sonarr_instance_id = instanceId
        }
        
        if (Object.keys(update).length > 2) {
          updates.push(update)
        }
      }
    }
    
    return updates
  }

  private processMovieStatusUpdates(
    radarrItems: RadarrItem[],
    watchlistItems: DatabaseWatchlistItem[],
  ) {
    const updates: Array<{
      userId: number
      key: string
      added?: string
      status?: 'pending' | 'requested' | 'grabbed' | 'notified'
      movie_status?: 'available' | 'unavailable'
      radarr_instance_id?: number
    }> = []
    
    for (const item of watchlistItems) {
      const radarrMatch = this.findMatch(radarrItems, item.guids)
      if (radarrMatch) {
        const instanceId = radarrMatch.radarr_instance_id || undefined
        
        const update: {
          userId: number
          key: string
          added?: string
          status?: 'pending' | 'requested' | 'grabbed' | 'notified'
          movie_status?: 'available' | 'unavailable'
          radarr_instance_id?: number
        } = {
          userId: item.user_id,
          key: item.key,
        }
        
        if (item.added !== radarrMatch.added) {
          update.added = radarrMatch.added
        }
        
        if (item.status !== radarrMatch.status) {
          if (item.status !== 'notified') {
            update.status = radarrMatch.status
          } else {
            this.log.debug(`Preventing status downgrade for movie ${item.title} [${item.key}]: keeping 'notified' instead of changing to '${radarrMatch.status}'`)
          }
        }
        
        if (item.movie_status !== radarrMatch.movie_status) {
          update.movie_status = radarrMatch.movie_status as 'available' | 'unavailable'
        }
        
        if (item.radarr_instance_id !== instanceId) {
          update.radarr_instance_id = instanceId
        }
        
        if (Object.keys(update).length > 2) { 
          updates.push(update)
        }
      }
    }
    
    return updates
  }

  private findMatch<T extends SonarrItem | RadarrItem>(
    items: T[],
    itemGuids: string[] | string | undefined,
  ): T | undefined {
    if (!itemGuids) return undefined
    const guids = Array.isArray(itemGuids)
      ? itemGuids
      : typeof itemGuids === 'string'
        ? JSON.parse(itemGuids)
        : []
    return items.find((item) =>
      item.guids.some((itemGuid) => guids.includes(itemGuid)),
    )
  }
}