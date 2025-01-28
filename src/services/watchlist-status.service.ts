import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'

interface DatabaseWatchlistItem {
  id?: number
  user_id: number
  title: string
  key: string
  type: string
  thumb?: string | null
  added?: string | null
  guids?: string[] | string
  genres?: string[] | string
  status: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended' | null
  movie_status?: string | null
  created_at?: string
  updated_at?: string
}

export class StatusService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly dbService: FastifyInstance['db'],
    private readonly sonarrService: FastifyInstance['sonarr'],
    private readonly radarrService: FastifyInstance['radarr'],
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
      const existingSeries = await this.sonarrService.fetchSeries()
      const watchlistItems = await this.dbService.getAllShowWatchlistItems()
      const updates = this.processShowStatusUpdates(
        Array.from(existingSeries),
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
      const existingMovies = await this.radarrService.fetchMovies()
      const watchlistItems = await this.dbService.getAllMovieWatchlistItems()
      const updates = this.processMovieStatusUpdates(
        Array.from(existingMovies),
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
    }> = []

    for (const item of watchlistItems) {
      const sonarrMatch = this.findMatch(sonarrItems, item.guids)
      if (sonarrMatch) {
        if (
          item.status !== sonarrMatch.status ||
          item.series_status !== sonarrMatch.series_status ||
          item.added !== sonarrMatch.added
        ) {
          updates.push({
            userId: item.user_id,
            key: item.key,
            added: sonarrMatch.added,
            status: sonarrMatch.status,
            series_status: sonarrMatch.series_status,
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
    }> = []

    for (const item of watchlistItems) {
      const radarrMatch = this.findMatch(radarrItems, item.guids)
      if (radarrMatch) {
        if (
          item.status !== radarrMatch.status ||
          item.movie_status !== radarrMatch.movie_status ||
          item.added !== radarrMatch.added
        ) {
          updates.push({
            userId: item.user_id,
            key: item.key,
            added: radarrMatch.added,
            status: radarrMatch.status,
            movie_status: radarrMatch.movie_status as
              | 'available'
              | 'unavailable',
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
      guids.some((guid: string) => item.guids.includes(guid)),
    )
  }
}
