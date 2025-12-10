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
    // Fetch both self and friends watchlists in parallel
    const fetchResults = await Promise.allSettled([
      // Self watchlist promise
      (async () => {
        try {
          deps.logger.debug('Fetching self watchlist')
          return await deps.plexService.getSelfWatchlist()
        } catch (selfError) {
          deps.logger.error(
            {
              error: selfError,
              errorMessage:
                selfError instanceof Error
                  ? selfError.message
                  : String(selfError),
              errorStack:
                selfError instanceof Error ? selfError.stack : undefined,
            },
            'Error refreshing self watchlist',
          )
          throw new Error('Failed to refresh self watchlist', {
            cause: selfError,
          })
        }
      })(),

      // Friends watchlist promise
      (async () => {
        try {
          deps.logger.debug('Fetching friends watchlists')
          return await deps.plexService.getOthersWatchlists()
        } catch (friendsError) {
          deps.logger.error(
            {
              error: friendsError,
              errorMessage:
                friendsError instanceof Error
                  ? friendsError.message
                  : String(friendsError),
              errorStack:
                friendsError instanceof Error ? friendsError.stack : undefined,
            },
            'Error refreshing friends watchlists',
          )
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
