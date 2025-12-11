/**
 * Watchlist Fetcher Module
 *
 * Fetches self and friends watchlists in parallel.
 */

import type { PlexWatchlistService } from '@services/plex-watchlist.service.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Dependencies for watchlist fetching
 */
export interface WatchlistFetcherDeps {
  logger: FastifyBaseLogger
  plexService: PlexWatchlistService
  /** Callback to unschedule pending reconciliation */
  unschedulePendingReconciliation: () => Promise<void>
}

/**
 * Fetch watchlists for self and all friends in parallel.
 *
 * Refreshes the local copy of watchlists and updates show/movie statuses.
 * Self and friend watchlists are fetched in parallel to improve performance.
 *
 * @param deps - Service dependencies
 */
export async function fetchWatchlists(
  deps: WatchlistFetcherDeps,
): Promise<void> {
  deps.logger.info('Refreshing watchlists')

  // Unschedule pending reconciliation since sync is starting
  await deps.unschedulePendingReconciliation()

  try {
    // Fetch both self and friends watchlists in parallel - both must succeed
    deps.logger.debug('Fetching self and friends watchlists in parallel')
    await Promise.all([
      deps.plexService.getSelfWatchlist(),
      deps.plexService.getOthersWatchlists(),
    ])

    deps.logger.info('Watchlists refreshed successfully')
  } catch (error) {
    deps.logger.error(
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
