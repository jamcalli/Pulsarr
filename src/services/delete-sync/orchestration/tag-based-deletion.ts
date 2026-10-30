import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { ExclusionDrivenGuids } from '@root/types/watchlist-exclusion.types.js'
import { isAnyGuidProtected } from '@services/delete-sync/cache/protected-cache.js'
import type { TagCache } from '@services/delete-sync/cache/tag-cache.js'
import { isAnyGuidTracked } from '@services/delete-sync/cache/tracked-cache.js'
import {
  processMovieDeletions,
  processShowDeletions,
} from '@services/delete-sync/processors/content-deleter.js'
import {
  countTaggedMovies,
  countTaggedSeries,
} from '@services/delete-sync/tag-operations/tag-counter.js'
import { getRemovalTagPrefixNormalized } from '@services/delete-sync/tag-operations/tag-matcher.js'
import { DeletionCounters } from '@services/delete-sync/utils/deletion-counters.js'
import {
  createEmptyResult,
  createSafetyTriggeredResult,
} from '@services/delete-sync/utils/result-builder.js'
import { performTagBasedSafetyCheck } from '@services/delete-sync/validation/safety-checker.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger } from 'fastify'

export interface TagBasedDeletionDeps {
  config: {
    removedTagPrefix: string
    deleteSyncTrackedOnly: boolean
    enablePlexPlaylistProtection: boolean
    deleteMovie: boolean
    deleteEndedShow: boolean
    deleteContinuingShow: boolean
    deleteFiles: boolean
    maxDeletionPrevention: number | string
    deleteSyncRequiredTagRegex?: string
  }
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  tagCache: TagCache
  protectedGuids: Set<string> | null
  trackedGuids: Set<string> | null
  /** GUIDs that exclusions mark for deletion alongside the removal tag, split by media type. */
  exclusionDrivenGuids: ExclusionDrivenGuids
  deletedMovieGuids: Set<string>
  deletedShowGuids: Set<string>
  logger: FastifyBaseLogger
  protectionPlaylistName: string
  setProtectedGuids: (guids: Set<string> | null) => void
  setTrackedGuids: (guids: Set<string> | null) => void
}

/** Null when the check passes, otherwise the safety-triggered result. */
async function performTagBasedDeletionSafetyCheck(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  deps: TagBasedDeletionDeps,
): Promise<DeleteSyncResult | null> {
  const { config, sonarrManager, radarrManager, tagCache, logger } = deps

  try {
    // Settles both so a failed counter never leaves the other writing the tag cache after the run ends
    const [seriesCount, moviesCount] = await Promise.allSettled([
      countTaggedSeries(
        existingSeries,
        {
          deleteEndedShow: config.deleteEndedShow,
          deleteContinuingShow: config.deleteContinuingShow,
          deleteMovie: config.deleteMovie,
          enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
          deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
          removedTagPrefix: config.removedTagPrefix,
          deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex,
          exclusionDrivenGuids: deps.exclusionDrivenGuids.show,
        },
        sonarrManager,
        tagCache,
        deps.protectedGuids,
        (guids) =>
          isAnyGuidProtected(
            guids,
            deps.protectedGuids,
            config.enablePlexPlaylistProtection,
          ),
        deps.trackedGuids,
        (guids) =>
          isAnyGuidTracked(
            guids,
            deps.trackedGuids,
            config.deleteSyncTrackedOnly,
          ),
        logger,
      ),
      countTaggedMovies(
        existingMovies,
        {
          deleteEndedShow: config.deleteEndedShow,
          deleteContinuingShow: config.deleteContinuingShow,
          deleteMovie: config.deleteMovie,
          enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
          deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
          removedTagPrefix: config.removedTagPrefix,
          deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex,
          exclusionDrivenGuids: deps.exclusionDrivenGuids.movie,
        },
        radarrManager,
        tagCache,
        deps.protectedGuids,
        (guids) =>
          isAnyGuidProtected(
            guids,
            deps.protectedGuids,
            config.enablePlexPlaylistProtection,
          ),
        deps.trackedGuids,
        (guids) =>
          isAnyGuidTracked(
            guids,
            deps.trackedGuids,
            config.deleteSyncTrackedOnly,
          ),
        logger,
      ),
    ])
    if (seriesCount.status === 'rejected') throw seriesCount.reason
    if (moviesCount.status === 'rejected') throw moviesCount.reason
    const taggedForDeletionSeries = seriesCount.value
    const taggedForDeletionMovies = moviesCount.value

    const safetyCheck = performTagBasedSafetyCheck(
      existingSeries,
      existingMovies,
      taggedForDeletionSeries,
      taggedForDeletionMovies,
      config,
      logger,
    )

    if (!safetyCheck.passed) {
      const errorMessage =
        safetyCheck.errorMessage || 'Safety check failed without message'
      logger.error(errorMessage)
      logger.error('Delete operation aborted to prevent mass deletion.')
      return createSafetyTriggeredResult(
        errorMessage,
        existingSeries.length,
        existingMovies.length,
      )
    }

    return null
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error : new Error(String(error)) },
      'Error during safety analysis for tag-based deletion:',
    )
    const errorMsg = `Error during safety analysis: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMsg)
    logger.error('Delete operation aborted to prevent mass deletion.')
    return createSafetyTriggeredResult(
      errorMsg,
      existingSeries.length,
      existingMovies.length,
    )
  }
}

/** Expects the tracked and protection caches already loaded, and aborts with a safety result when either is missing. */
export async function executeTagBasedDeletion(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  deps: TagBasedDeletionDeps,
  dryRun = false,
): Promise<DeleteSyncResult> {
  const { config, logger, sonarrManager, radarrManager, tagCache } = deps

  logger.debug(
    `Beginning tag-based deletion ${dryRun ? '(DRY RUN)' : 'process'} using tag "${config.removedTagPrefix}"`,
  )

  const removalTagPrefix = getRemovalTagPrefixNormalized(
    config.removedTagPrefix,
  )
  if (!removalTagPrefix) {
    logger.info(
      'Tag-based deletion requested but removedTagPrefix is blank, skipping operation',
    )
    return createEmptyResult(
      'Tag-based deletion requested but removedTagPrefix is blank, skipping operation',
    )
  }

  if (config.deleteSyncTrackedOnly && !deps.trackedGuids) {
    const errorMsg =
      'Tracked-only deletion is enabled but tracked GUIDs were not loaded'
    logger.error(errorMsg)
    return createSafetyTriggeredResult(
      errorMsg,
      existingSeries.length,
      existingMovies.length,
    )
  }

  if (config.enablePlexPlaylistProtection && !deps.protectedGuids) {
    const errorMsg =
      'Plex playlist protection is enabled but protected GUIDs were not loaded'
    logger.error(errorMsg)
    return createSafetyTriggeredResult(
      errorMsg,
      existingSeries.length,
      existingMovies.length,
    )
  }

  const safetyCheckResult = await performTagBasedDeletionSafetyCheck(
    existingSeries,
    existingMovies,
    deps,
  )
  if (safetyCheckResult) {
    return safetyCheckResult
  }

  const counters = new DeletionCounters()

  await processMovieDeletions(
    {
      movies: existingMovies,
      config: {
        deletionMode: 'tag-based',
        deleteMovie: config.deleteMovie,
        deleteFiles: config.deleteFiles,
        deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
        enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
        deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex,
        removedTagPrefix: config.removedTagPrefix,
        exclusionDrivenGuids: deps.exclusionDrivenGuids.movie,
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

  await processShowDeletions(
    {
      shows: existingSeries,
      config: {
        deletionMode: 'tag-based',
        deleteEndedShow: config.deleteEndedShow,
        deleteContinuingShow: config.deleteContinuingShow,
        deleteFiles: config.deleteFiles,
        deleteSyncTrackedOnly: config.deleteSyncTrackedOnly,
        enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
        deleteSyncRequiredTagRegex: config.deleteSyncRequiredTagRegex,
        removedTagPrefix: config.removedTagPrefix,
        exclusionDrivenGuids: deps.exclusionDrivenGuids.show,
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
    `Tag-based delete sync ${dryRun ? '(DRY RUN)' : 'operation'} complete: ${counters.totalDeleted} items identified for deletion, ${counters.totalSkipped} skipped, ${counters.totalProtected} protected, ${counters.totalProcessed} total processed`,
  )

  logger.debug(
    {
      ...deletionSummary,
      dryRun,
    },
    `Detailed tag-based deletion ${dryRun ? '(DRY RUN)' : 'operation'} summary`,
  )

  return deletionSummary
}
