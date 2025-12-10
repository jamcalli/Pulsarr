/**
 * Sync Engine Module
 *
 * Main sync engine that processes all watchlist items during reconciliation.
 * Handles routing to Sonarr/Radarr with user sync settings respected.
 */

import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  extractTmdbId,
  extractTvdbId,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import pLimit from 'p-limit'
import { routeMovie, routeShow } from '../routing/index.js'
import type { SyncEngineDeps } from '../types.js'

/**
 * Result of sync operation
 */
export interface SyncResult {
  added: {
    shows: number
    movies: number
  }
  unmatched: {
    shows: number
    movies: number
  }
  skippedDueToUserSetting: number
  skippedDueToMissingIds: number
}

/**
 * Synchronize watchlist items between Plex, Sonarr, and Radarr.
 *
 * Processes all watchlist items, respecting user sync settings,
 * and ensures items are correctly routed to the appropriate instances.
 *
 * @param deps - Service dependencies
 * @returns Sync result statistics
 */
export async function syncWatchlistItems(
  deps: SyncEngineDeps,
): Promise<SyncResult> {
  deps.logger.info('Performing watchlist item sync')

  try {
    // Clear Plex resources cache to ensure fresh data for this reconciliation cycle
    deps.fastify.plexServerService.clearPlexResourcesCache()

    // Clear content availability cache for this reconciliation cycle
    // This is reconciliation-scoped - cache is rebuilt fresh each cycle
    deps.fastify.plexServerService.clearContentCacheForReconciliation()

    // Check health of all Sonarr/Radarr instances before proceeding
    // Abort if ANY instance is unavailable to prevent incorrect routing decisions
    const [sonarrHealth, radarrHealth] = await Promise.all([
      deps.sonarrManager.checkInstancesHealth(),
      deps.radarrManager.checkInstancesHealth(),
    ])

    const totalConfigured =
      sonarrHealth.available.length +
      sonarrHealth.unavailable.length +
      radarrHealth.available.length +
      radarrHealth.unavailable.length

    if (totalConfigured === 0) {
      deps.logger.debug(
        'No Radarr/Sonarr instances configured, skipping reconciliation',
      )
      return {
        added: { shows: 0, movies: 0 },
        unmatched: { shows: 0, movies: 0 },
        skippedDueToUserSetting: 0,
        skippedDueToMissingIds: 0,
      }
    }

    if (
      sonarrHealth.unavailable.length > 0 ||
      radarrHealth.unavailable.length > 0
    ) {
      deps.logger.error(
        {
          sonarrUnavailable: sonarrHealth.unavailable,
          radarrUnavailable: radarrHealth.unavailable,
        },
        'Some instances unavailable, aborting reconciliation to prevent incorrect routing',
      )
      return {
        added: { shows: 0, movies: 0 },
        unmatched: { shows: 0, movies: 0 },
        skippedDueToUserSetting: 0,
        skippedDueToMissingIds: 0,
      }
    }

    // Get all users to check their sync permissions
    const allUsers = await deps.db.getAllUsers()
    const userSyncStatus = new Map<number, boolean>()
    const userById = new Map<number, (typeof allUsers)[number]>()

    // Create maps for user sync status and user objects for quick lookups (avoids N+1 queries)
    for (const user of allUsers) {
      userSyncStatus.set(user.id, user.can_sync !== false)
      userById.set(user.id, user)
    }

    // Fetch primary user once to avoid N+1 queries during item processing
    const primaryUser = (await deps.db.getPrimaryUser()) ?? null

    // DEBUG: Log user sync settings
    for (const [userId, canSync] of userSyncStatus.entries()) {
      deps.logger.debug(`User ${userId} can_sync setting: ${canSync}`)
    }

    // Get all shows and movies from watchlists
    const [shows, movies] = await Promise.all([
      deps.db.getAllShowWatchlistItems(),
      deps.db.getAllMovieWatchlistItems(),
    ])
    const allWatchlistItems = [...shows, ...movies]

    // Get all existing series and movies from Sonarr/Radarr
    // Each instance's bypassIgnored setting determines if exclusions are included
    const [existingSeries, existingMovies] = await Promise.all([
      deps.sonarrManager.fetchAllSeries(),
      deps.radarrManager.fetchAllMovies(),
    ])

    // Statistics tracking
    let showsAdded = 0
    let moviesAdded = 0
    let unmatchedShows = 0
    let unmatchedMovies = 0
    let skippedDueToUserSetting = 0
    let skippedDueToMissingIds = 0
    const skippedItems: { shows: string[]; movies: string[] } = {
      shows: [],
      movies: [],
    }

    // Create a set of all watchlist GUIDs for fast lookup
    const watchlistGuids = new Set(
      allWatchlistItems.flatMap((item) => parseGuids(item.guids)),
    )

    // Check unmatched items in Sonarr/Radarr (for reporting purposes)
    for (const series of existingSeries) {
      const hasMatch = series.guids.some((guid) => watchlistGuids.has(guid))
      if (!hasMatch) {
        unmatchedShows++
        deps.logger.debug(
          {
            title: series.title,
            guids: series.guids,
          },
          'Sonarr series not matched to any watchlist item',
        )
      }
    }

    for (const movie of existingMovies) {
      const hasMatch = movie.guids.some((guid) => watchlistGuids.has(guid))
      if (!hasMatch) {
        unmatchedMovies++
        deps.logger.debug(
          {
            title: movie.title,
            guids: movie.guids,
          },
          'Radarr movie not matched to any watchlist item',
        )
      }
    }

    // Process watchlist items with rate limiting to prevent overwhelming Plex
    // Use same concurrency pattern as label sync service
    const concurrencyLimit = deps.config.plexLabelSync?.concurrencyLimit || 5
    const limit = pLimit(concurrencyLimit)

    deps.logger.debug(
      `Processing ${allWatchlistItems.length} watchlist items with concurrency limit of ${concurrencyLimit}`,
    )

    const processingResults = await Promise.allSettled(
      allWatchlistItems.map((item) =>
        limit(async () => {
          try {
            const numericUserId = item.user_id

            if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
              deps.logger.warn(
                `Item "${item.title}" has invalid user_id: ${item.user_id}, skipping`,
              )
              return { type: 'skipped', reason: 'invalid_user_id' }
            }

            // Check if user has sync enabled
            const canSync = userSyncStatus.get(numericUserId)

            if (canSync === false) {
              deps.logger.debug(
                `Skipping item "${item.title}" during sync as user ${numericUserId} has sync disabled`,
              )
              return { type: 'skipped', reason: 'user_setting' }
            }

            // Parse GUIDs and genres once for reuse
            const parsedGuids = parseGuids(item.guids)
            const parsedGenres = parseGenres(item.genres)

            // Convert item to temp format for processing
            const tempItem: TemptRssWatchlistItem = {
              title: item.title,
              type: item.type,
              thumb: item.thumb ?? undefined,
              guids: parsedGuids,
              genres: parsedGenres,
              key: item.key,
            }

            // Process shows
            if (item.type === 'show') {
              // Check for TVDB ID using extractTvdbId
              const tvdbId = extractTvdbId(parsedGuids)

              if (tvdbId === 0) {
                return {
                  type: 'skipped',
                  reason: 'missing_id',
                  title: tempItem.title,
                  contentType: 'show',
                }
              }

              // Use helper for routing-aware existence check and routing
              const user = userById.get(numericUserId)
              const sonarrItem: SonarrItem = {
                title: tempItem.title,
                guids: parsedGuids,
                type: 'show',
                ended: false,
                genres: parsedGenres,
                status: 'pending',
                series_status: 'continuing',
              }

              const result = await routeShow(
                {
                  tempItem,
                  userId: numericUserId,
                  userName: user?.name,
                  sonarrItem,
                  existingSeries,
                  primaryUser,
                },
                deps,
              )

              return { type: 'show', added: result.routed }
            }
            // Process movies
            if (item.type === 'movie') {
              // Check for TMDB ID using extractTmdbId
              const tmdbId = extractTmdbId(parsedGuids)

              if (tmdbId === 0) {
                return {
                  type: 'skipped',
                  reason: 'missing_id',
                  title: tempItem.title,
                  contentType: 'movie',
                }
              }

              // Use helper for routing-aware existence check and routing
              const user = userById.get(numericUserId)
              const radarrItem: RadarrItem = {
                title: tempItem.title,
                guids: parsedGuids,
                type: 'movie',
                genres: parsedGenres,
              }

              const result = await routeMovie(
                {
                  tempItem,
                  userId: numericUserId,
                  userName: user?.name,
                  radarrItem,
                  existingMovies,
                  primaryUser,
                },
                deps,
              )

              return { type: 'movie', added: result.routed }
            }

            return { type: 'unknown' }
          } catch (error) {
            // Return error with context instead of throwing
            return {
              type: 'error',
              error,
              title: item.title,
              itemType: item.type,
              key: item.key,
            }
          }
        }),
      ),
    )

    // Aggregate results
    for (const result of processingResults) {
      if (result.status === 'fulfilled') {
        const value = result.value
        if (value.type === 'show' && value.added) {
          showsAdded++
        } else if (value.type === 'movie' && value.added) {
          moviesAdded++
        } else if (value.type === 'skipped') {
          if (value.reason === 'user_setting') {
            skippedDueToUserSetting++
          } else if (value.reason === 'missing_id') {
            skippedDueToMissingIds++
            if (value.contentType === 'show') {
              skippedItems.shows.push(value.title)
            } else if (value.contentType === 'movie') {
              skippedItems.movies.push(value.title)
            }
          }
        } else if (value.type === 'error') {
          deps.logger.error(
            {
              error: value.error,
              title: value.title,
              itemType: value.itemType,
              key: value.key,
            },
            'Error processing watchlist item during reconciliation',
          )
        }
      } else {
        // Promise rejection (shouldn't happen with try-catch, but handle defensively)
        deps.logger.error(
          { error: result.reason },
          'Unexpected rejection processing watchlist item',
        )
      }
    }

    // Prepare summary statistics
    const summary: SyncResult = {
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

    deps.logger.info(
      {
        added: summary.added,
        unmatched: summary.unmatched,
        skippedDueToUserSetting: summary.skippedDueToUserSetting,
        skippedDueToMissingIds: summary.skippedDueToMissingIds,
      },
      'Watchlist sync completed',
    )

    // Update auto-approval records to attribute them to actual users
    await deps.updateAutoApprovalUserAttributionWithPrefetch(
      shows,
      movies,
      userById as Map<number, { id: number; name: string }>,
    )

    // Sync statuses after adding new content to ensure tags are applied
    // Pass the already-fetched data to avoid redundant API calls
    try {
      const { shows: showUpdates, movies: movieUpdates } =
        await deps.statusService.syncAllStatuses({
          existingSeries,
          existingMovies,
        })
      deps.logger.debug(
        `Updated ${showUpdates} show statuses and ${movieUpdates} movie statuses after watchlist sync`,
      )
    } catch (statusError) {
      deps.logger.warn(
        { error: statusError },
        'Error syncing statuses after watchlist sync (non-fatal)',
      )
      // Continue despite this error
    }

    // Log warnings about unmatched items
    if (unmatchedShows > 0 || unmatchedMovies > 0) {
      deps.logger.debug(
        `Found ${unmatchedShows} shows and ${unmatchedMovies} movies in Sonarr/Radarr that are not in watchlists`,
      )
    }

    // Log skipped items info
    if (skippedDueToUserSetting > 0) {
      deps.logger.info(
        `Skipped ${skippedDueToUserSetting} items due to user sync settings`,
      )
    }

    if (skippedDueToMissingIds > 0) {
      const showsRemaining = Math.max(0, skippedItems.shows.length - 3)
      const moviesRemaining = Math.max(0, skippedItems.movies.length - 3)
      deps.logger.warn(
        {
          total: skippedDueToMissingIds,
          shows: {
            count: skippedItems.shows.length,
            examples: skippedItems.shows.slice(0, 3),
            ...(showsRemaining > 0 && { andMore: showsRemaining }),
          },
          movies: {
            count: skippedItems.movies.length,
            examples: skippedItems.movies.slice(0, 3),
            ...(moviesRemaining > 0 && { andMore: moviesRemaining }),
          },
        },
        'Skipped items due to missing required IDs',
      )
    }

    return summary
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error during watchlist sync',
    )
    throw error
  }
}
