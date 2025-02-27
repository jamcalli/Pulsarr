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

        if (
          item.status !== sonarrMatch.status ||
          item.series_status !== sonarrMatch.series_status ||
          item.added !== sonarrMatch.added ||
          item.sonarr_instance_id !== instanceId
        ) {
          updates.push({
            userId: item.user_id,
            key: item.key,
            added: sonarrMatch.added,
            status: sonarrMatch.status,
            series_status: sonarrMatch.series_status,
            sonarr_instance_id: instanceId,
          })
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

        if (
          item.status !== radarrMatch.status ||
          item.movie_status !== radarrMatch.movie_status ||
          item.added !== radarrMatch.added ||
          item.radarr_instance_id !== instanceId
        ) {
          updates.push({
            userId: item.user_id,
            key: item.key,
            added: radarrMatch.added,
            status: radarrMatch.status,
            movie_status: radarrMatch.movie_status as
              | 'available'
              | 'unavailable',
            radarr_instance_id: instanceId,
          })
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
