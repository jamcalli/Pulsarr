import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { SonarrConfiguration, Item } from '@root/types/sonarr.types.js'

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
  created_at?: string
  updated_at?: string
}

export class ShowStatusService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly dbService: FastifyInstance['db'],
    private readonly sonarrService: FastifyInstance['sonarr'],
    private readonly config: FastifyInstance['config'],
  ) {}

  async syncSonarrStatuses(): Promise<number> {
    try {
      // Get all shows from Sonarr
      const sonarrConfig: SonarrConfiguration = {
        sonarrApiKey: this.config.sonarrApiKey,
        sonarrBaseUrl: this.config.sonarrBaseUrl,
        sonarrQualityProfileId: this.config.sonarrQualityProfile,
        sonarrRootFolder: this.config.sonarrRootFolder,
        sonarrLanguageProfileId: 1,
        sonarrSeasonMonitoring: 'all',
        sonarrTagIds: this.config.sonarrTags,
      }

      const existingSeries = await this.sonarrService.fetchSeries(
        sonarrConfig.sonarrApiKey,
        sonarrConfig.sonarrBaseUrl,
      )

      // Get all shows from database
      const watchlistItems = await this.dbService.getAllShowWatchlistItems()

      // Process updates
      const updates = this.processStatusUpdates(
        Array.from(existingSeries),
        watchlistItems,
      )

      // Bulk update database
      if (updates.length > 0) {
        return await this.dbService.bulkUpdateShowStatuses(updates)
      }

      return 0
    } catch (error) {
      this.log.error('Error syncing Sonarr statuses:', error)
      throw error
    }
  }

  private processStatusUpdates(
    sonarrItems: Item[],
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
      // Use the already processed Item from Sonarr
      const sonarrMatch = this.findSonarrMatch(sonarrItems, item.guids)

      if (sonarrMatch) {
        // Only update if values are different
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

  private findSonarrMatch(
    sonarrItems: Item[],
    itemGuids: string[] | string | undefined,
  ): Item | undefined {
    if (!itemGuids) return undefined

    const guids = Array.isArray(itemGuids)
      ? itemGuids
      : typeof itemGuids === 'string'
        ? JSON.parse(itemGuids)
        : []

    return sonarrItems.find((item) =>
      guids.some((guid: string) => item.guids.includes(guid)),
    )
  }
}
