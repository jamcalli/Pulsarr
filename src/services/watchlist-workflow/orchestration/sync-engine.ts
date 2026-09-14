import type { TemptRssWatchlistItem } from '@root/types/plex.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { SYSTEM_USER_ID } from '@services/database/methods/watchlist-exclusion.js'
import {
  extractTmdbId,
  extractTvdbId,
  parseGenres,
  parseGuids,
} from '@utils/guid-handler.js'
import pLimit from 'p-limit'
import { updateAutoApprovalUserAttribution } from '../attribution/approval-attributor.js'
import { evaluateWatchlistCaps } from '../quota/watchlist-cap-gate.js'
import { routeMovie, routeShow } from '../routing/content-router.js'
import type { WorkflowDeps } from '../types.js'

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
  skippedDueToWatchlistCap: number
  skippedDueToExclusion: number
  skippedDueToRouting: number
}

export async function syncWatchlistItems(
  deps: WorkflowDeps,
): Promise<SyncResult> {
  deps.logger.info('Performing watchlist item sync')

  try {
    deps.fastify.plexServerService.clearPlexResourcesCache()

    deps.fastify.plexServerService.clearContentCacheForReconciliation()

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
        skippedDueToWatchlistCap: 0,
        skippedDueToExclusion: 0,
        skippedDueToRouting: 0,
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
        skippedDueToWatchlistCap: 0,
        skippedDueToExclusion: 0,
        skippedDueToRouting: 0,
      }
    }

    // With skipIfExistsOnPlex on, an unreachable Plex answers not-found for everything and mass-routes
    if (deps.config.skipIfExistsOnPlex) {
      const plexHealth =
        await deps.fastify.plexServerService.checkPlexServerHealth()

      if (!plexHealth.reachable) {
        deps.logger.error(
          { serverName: plexHealth.serverName },
          'Plex server unreachable, aborting reconciliation to prevent incorrect routing (skipIfExistsOnPlex is enabled)',
        )
        return {
          added: { shows: 0, movies: 0 },
          unmatched: { shows: 0, movies: 0 },
          skippedDueToUserSetting: 0,
          skippedDueToMissingIds: 0,
          skippedDueToWatchlistCap: 0,
          skippedDueToExclusion: 0,
          skippedDueToRouting: 0,
        }
      }
    }

    const allUsers = await deps.db.getAllUsers()
    const userSyncStatus = new Map<number, boolean>()
    const userById = new Map<number, (typeof allUsers)[number]>()

    for (const user of allUsers) {
      userSyncStatus.set(user.id, user.can_sync !== false)
      userById.set(user.id, user)
    }

    const primaryUser = (await deps.db.getPrimaryUser()) ?? null

    for (const [userId, canSync] of userSyncStatus.entries()) {
      deps.logger.debug(`User ${userId} can_sync setting: ${canSync}`)
    }

    const [shows, movies] = await Promise.all([
      deps.db.getAllShowWatchlistItems(),
      deps.db.getAllMovieWatchlistItems(),
    ])
    const allWatchlistItems = [...shows, ...movies]

    const { skipIds, cappedEntries } = await evaluateWatchlistCaps(
      { db: deps.db, logger: deps.logger },
      allWatchlistItems,
    )

    const exclusionMap = await deps.db.getExclusionMap()

    // The notification service debounces these, so repeats per cycle are harmless
    for (const entry of cappedEntries) {
      const user = userById.get(entry.userId)
      deps.notifications.sendWatchlistCapReached({
        userId: entry.userId,
        userName: user?.name ?? null,
        contentType: entry.contentType,
        currentCount: entry.currentCount,
        cap: entry.cap,
      })
    }

    // Each instance's bypassIgnored setting decides whether exclusions come back in these fetches
    const [existingSeries, existingMovies] = await Promise.all([
      deps.sonarrManager.fetchAllSeries(),
      deps.radarrManager.fetchAllMovies(),
    ])

    let showsAdded = 0
    let moviesAdded = 0
    let unmatchedShows = 0
    let unmatchedMovies = 0
    let skippedDueToUserSetting = 0
    let skippedDueToMissingIds = 0
    let skippedDueToWatchlistCap = 0
    let skippedDueToExclusion = 0
    let skippedDueToRouting = 0
    const skippedItems: { shows: string[]; movies: string[] } = {
      shows: [],
      movies: [],
    }

    const watchlistGuids = new Set(
      allWatchlistItems.flatMap((item) => parseGuids(item.guids)),
    )

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

            const canSync = userSyncStatus.get(numericUserId)

            if (canSync === false) {
              deps.logger.debug(
                `Skipping item "${item.title}" during sync as user ${numericUserId} has sync disabled`,
              )
              return { type: 'skipped', reason: 'user_setting' }
            }

            if (skipIds.has(item.id)) {
              return { type: 'skipped', reason: 'watchlist_cap' }
            }

            // SYSTEM_USER_ID in the exclusion set is a global veto, not a per-user one
            const excludedUsers = exclusionMap.get(item.key)
            if (
              excludedUsers?.has(numericUserId) ||
              excludedUsers?.has(SYSTEM_USER_ID)
            ) {
              deps.logger.debug(
                `Skipping item "${item.title}" for user ${numericUserId} due to exclusion`,
              )
              return { type: 'skipped', reason: 'exclusion' }
            }

            const parsedGuids = parseGuids(item.guids)
            const parsedGenres = parseGenres(item.genres)

            const tempItem: TemptRssWatchlistItem = {
              title: item.title,
              type: item.type,
              thumb: item.thumb ?? undefined,
              guids: parsedGuids,
              genres: parsedGenres,
              key: item.key,
            }

            if (item.type === 'show') {
              const tvdbId = extractTvdbId(parsedGuids)

              if (tvdbId === 0) {
                return {
                  type: 'skipped',
                  reason: 'missing_id',
                  title: tempItem.title,
                  contentType: 'show',
                }
              }

              const user = userById.get(numericUserId)
              const sonarrItem: SonarrItem = {
                title: tempItem.title,
                guids: parsedGuids,
                type: 'show',
                ended: false,
                genres: parsedGenres,
                status: 'pending',
                series_status: 'continuing',
                imdb: item.ratings?.imdb,
                rtCritic: item.ratings?.rtCritic,
                rtAudience: item.ratings?.rtAudience,
                tmdb: item.ratings?.tmdb,
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

              return {
                type: 'show',
                added: result.routed,
                skippedReason: result.skippedReason,
              }
            }
            if (item.type === 'movie') {
              const tmdbId = extractTmdbId(parsedGuids)

              if (tmdbId === 0) {
                return {
                  type: 'skipped',
                  reason: 'missing_id',
                  title: tempItem.title,
                  contentType: 'movie',
                }
              }

              const user = userById.get(numericUserId)
              const radarrItem: RadarrItem = {
                title: tempItem.title,
                guids: parsedGuids,
                type: 'movie',
                genres: parsedGenres,
                imdb: item.ratings?.imdb,
                rtCritic: item.ratings?.rtCritic,
                rtAudience: item.ratings?.rtAudience,
                tmdb: item.ratings?.tmdb,
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

              return {
                type: 'movie',
                added: result.routed,
                skippedReason: result.skippedReason,
              }
            }

            return { type: 'unknown' }
          } catch (error) {
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

    for (const result of processingResults) {
      if (result.status === 'fulfilled') {
        const value = result.value
        if (value.type === 'show' && value.added) {
          showsAdded++
        } else if (value.type === 'movie' && value.added) {
          moviesAdded++
        } else if (
          (value.type === 'show' || value.type === 'movie') &&
          (value.skippedReason === 'default-skip' ||
            value.skippedReason === 'excluded')
        ) {
          skippedDueToRouting++
        } else if (value.type === 'skipped') {
          if (value.reason === 'user_setting') {
            skippedDueToUserSetting++
          } else if (value.reason === 'watchlist_cap') {
            skippedDueToWatchlistCap++
          } else if (value.reason === 'exclusion') {
            skippedDueToExclusion++
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
        deps.logger.error(
          { error: result.reason },
          'Unexpected rejection processing watchlist item',
        )
      }
    }

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
      skippedDueToWatchlistCap,
      skippedDueToExclusion,
      skippedDueToRouting,
    }

    deps.logger.info(
      {
        added: summary.added,
        unmatched: summary.unmatched,
        skippedDueToUserSetting: summary.skippedDueToUserSetting,
        skippedDueToMissingIds: summary.skippedDueToMissingIds,
        skippedDueToWatchlistCap: summary.skippedDueToWatchlistCap,
        skippedDueToExclusion: summary.skippedDueToExclusion,
        skippedDueToRouting: summary.skippedDueToRouting,
      },
      'Watchlist sync completed',
    )

    await updateAutoApprovalUserAttribution(deps, { shows, movies, userById })

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
    }

    if (unmatchedShows > 0 || unmatchedMovies > 0) {
      deps.logger.debug(
        `Found ${unmatchedShows} shows and ${unmatchedMovies} movies in Sonarr/Radarr that are not in watchlists`,
      )
    }

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
