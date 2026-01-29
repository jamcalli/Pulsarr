import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { TagCache } from '@services/delete-sync/cache/index.js'
import {
  isAnyGuidProtected,
  isAnyGuidTracked,
} from '@services/delete-sync/cache/index.js'
import {
  processMovieDeletions,
  processShowDeletions,
} from '@services/delete-sync/processors/content-deleter.js'
import { DeletionCounters } from '@services/delete-sync/utils/deletion-counters.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface WatchlistDeletionDeps {
  config: {
    deleteMovie: boolean
    deleteEndedShow: boolean
    deleteContinuingShow: boolean
    deleteFiles: boolean
    deleteSyncTrackedOnly: boolean
    enablePlexPlaylistProtection: boolean
  }
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  tagCache: TagCache
  protectedGuids: Set<string> | null
  trackedGuids: Set<string> | null
  deletedMovieGuids: Set<string>
  deletedShowGuids: Set<string>
  logger: FastifyBaseLogger
  protectionPlaylistName: string
}

/**
 * Orchestrates watchlist-based deletion process
 *
 * @param existingSeries - All series from Sonarr
 * @param existingMovies - All movies from Radarr
 * @param watchlistGuids - Set of GUIDs that exist in watchlists
 * @param deps - Dependencies containing services and configuration
 * @param dryRun - Whether to simulate without making changes
 * @returns Delete sync result
 */
export async function executeWatchlistDeletion(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  watchlistGuids: Set<string>,
  deps: WatchlistDeletionDeps,
  dryRun = false,
): Promise<DeleteSyncResult> {
  const { config, logger, sonarrManager, radarrManager, tagCache } = deps

  logger.info(
    `Beginning deletion ${dryRun ? '(DRY RUN)' : 'process'} based on configuration`,
  )

  // Initialize deletion counters
  const counters = new DeletionCounters()

  // Process movie deletions using unified processor
  await processMovieDeletions(
    {
      movies: existingMovies,
      config: {
        deletionMode: 'watchlist',
        deleteMovie: config.deleteMovie,
        deleteFiles: config.deleteFiles,
        deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
        enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
        watchlistGuids,
      },
      validators: {
        isAnyGuidTracked: (guids, onHit) =>
          isAnyGuidTracked(
            guids,
            deps.trackedGuids,
            config.deleteSyncTrackedOnly,
            onHit,
          ),
        isAnyGuidProtected: (guids, onHit) =>
          isAnyGuidProtected(
            guids,
            deps.protectedGuids,
            config.enablePlexPlaylistProtection,
            onHit,
          ),
      },
      radarrManager,
      tagCache,
      protectedGuids: deps.protectedGuids,
      logger,
      dryRun,
      deletedGuidsTracker: deps.deletedMovieGuids,
      playlistName: deps.protectionPlaylistName,
    },
    counters,
  )

  // Process show deletions using unified processor
  await processShowDeletions(
    {
      shows: existingSeries,
      config: {
        deletionMode: 'watchlist',
        deleteEndedShow: config.deleteEndedShow,
        deleteContinuingShow: config.deleteContinuingShow,
        deleteFiles: config.deleteFiles,
        deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
        enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
        watchlistGuids,
      },
      validators: {
        isAnyGuidTracked: (guids, onHit) =>
          isAnyGuidTracked(
            guids,
            deps.trackedGuids,
            config.deleteSyncTrackedOnly,
            onHit,
          ),
        isAnyGuidProtected: (guids, onHit) =>
          isAnyGuidProtected(
            guids,
            deps.protectedGuids,
            config.enablePlexPlaylistProtection,
            onHit,
          ),
      },
      sonarrManager,
      tagCache,
      protectedGuids: deps.protectedGuids,
      logger,
      dryRun,
      deletedGuidsTracker: deps.deletedShowGuids,
      playlistName: deps.protectionPlaylistName,
    },
    counters,
  )

  // Build summary from counters
  const deletionSummary = {
    movies: {
      deleted: counters.moviesDeleted,
      skipped: counters.moviesSkipped,
      protected: counters.moviesProtected,
      items: counters.moviesToDelete,
    },
    shows: {
      deleted: counters.totalShowsDeleted,
      skipped: counters.totalShowsSkipped,
      protected: counters.showsProtected,
      items: counters.showsToDelete,
    },
    total: {
      deleted: counters.totalDeleted,
      skipped: counters.totalSkipped,
      protected: counters.totalProtected,
      processed: counters.totalProcessed,
    },
  }

  logger.info(
    `Delete sync ${dryRun ? '(DRY RUN)' : 'operation'} complete: ${counters.totalDeleted} items identified for deletion, ${counters.totalSkipped} skipped${config.enablePlexPlaylistProtection ? `, ${counters.totalProtected} protected` : ''}, ${counters.totalProcessed} total processed`,
  )

  // Log detailed summary at debug level
  logger.debug(
    {
      ...deletionSummary,
      dryRun,
    },
    `Detailed deletion ${dryRun ? '(DRY RUN)' : 'operation'} summary`,
  )

  // Resources will be cleared in finally block of run() method

  return deletionSummary
}
