import type { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger } from 'fastify'

export interface MetadataRefreshDeps {
  plexWatchlist: Pick<
    PlexWatchlistService,
    'getSelfWatchlist' | 'getOthersWatchlists'
  >
  log: FastifyBaseLogger
}

export class MetadataRefreshService {
  private readonly log: FastifyBaseLogger
  private readonly plexWatchlist: MetadataRefreshDeps['plexWatchlist']
  private inFlight: Promise<void> | null = null

  constructor(deps: MetadataRefreshDeps) {
    this.log = createServiceLogger(deps.log, 'METADATA_REFRESH')
    this.plexWatchlist = deps.plexWatchlist
  }

  start(): boolean {
    if (this.inFlight) {
      return false
    }

    this.execute().catch((error) => {
      this.log.error({ error }, 'Metadata refresh failed')
    })

    return true
  }

  async run(): Promise<void> {
    if (this.inFlight) {
      this.log.info('Metadata refresh already running, skipping')
      return
    }

    await this.execute()
  }

  isRunning(): boolean {
    return this.inFlight !== null
  }

  private execute(): Promise<void> {
    const inFlight = this.runRefresh().finally(() => {
      this.inFlight = null
    })

    this.inFlight = inFlight

    return inFlight
  }

  private async runRefresh(): Promise<void> {
    this.log.info('Starting metadata refresh for all watchlist items')

    const [selfWatchlistResult, othersWatchlistResult] = await Promise.all([
      this.plexWatchlist.getSelfWatchlist(true),
      this.plexWatchlist.getOthersWatchlists(true),
    ])

    const totalSelfItems = selfWatchlistResult.total
    const totalOthersItems = othersWatchlistResult.total
    const totalItems = totalSelfItems + totalOthersItems

    this.log.info(
      `Metadata refresh completed: ${totalItems} items refreshed (${totalSelfItems} self, ${totalOthersItems} others)`,
    )
  }
}
