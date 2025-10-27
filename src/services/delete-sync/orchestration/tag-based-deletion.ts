import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { TagCache } from '@services/delete-sync/cache/index.js'
import {
  ensureProtectionCache,
  ensureTrackedCache,
} from '@services/delete-sync/cache/index.js'
import {
  processMovieDeletions,
  processShowDeletions,
} from '@services/delete-sync/processors/index.js'
import {
  createEmptyResult,
  createSafetyTriggeredResult,
} from '@services/delete-sync/result-builder.js'
import { performSafetyCheck } from '@services/delete-sync/safety-checker.js'
import {
  countTaggedMovies,
  countTaggedSeries,
  getRemovalTagPrefixNormalized,
} from '@services/delete-sync/tag-operations/index.js'
import { DeletionCounters } from '@services/delete-sync/utils/index.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export interface TagBasedDeletionContext {
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
  dbService: DatabaseService
  fastify: FastifyInstance
  tagCache: TagCache
  protectedGuids: Set<string> | null
  trackedGuids: Set<string> | null
  deletedMovieGuids: Set<string>
  deletedShowGuids: Set<string>
  logger: FastifyBaseLogger
  protectionPlaylistName: string
  setProtectedGuids: (guids: Set<string> | null) => void
  setTrackedGuids: (guids: Set<string> | null) => void
}

/**
 * Orchestrates tag-based deletion process
 *
 * @param existingSeries - All series from Sonarr
 * @param existingMovies - All movies from Radarr
 * @param context - Context containing services and configuration
 * @param dryRun - Whether to simulate without making changes
 * @returns Delete sync result
 */
export async function executeTagBasedDeletion(
  existingSeries: SonarrItem[],
  existingMovies: RadarrItem[],
  context: TagBasedDeletionContext,
  dryRun = false,
): Promise<DeleteSyncResult> {
  const { config, logger, sonarrManager, radarrManager, tagCache } = context

  logger.debug(
    `Beginning tag-based deletion ${dryRun ? '(DRY RUN)' : 'process'} using tag "${config.removedTagPrefix}"`,
  )

  // Validate once to avoid per-item warnings/work
  const removalTagPrefix = getRemovalTagPrefixNormalized(
    config.removedTagPrefix,
  )
  if (!removalTagPrefix) {
    logger.info(
      'Tag-based deletion requested but removedTagPrefix is blank – skipping operation',
    )
    return createEmptyResult(
      'Tag-based deletion requested but removedTagPrefix is blank – skipping operation',
    )
  }

  // Cache is already cleared at the start of run() method

  // Load tracked content GUIDs if tracked-only deletion is enabled
  if (config.deleteSyncTrackedOnly) {
    logger.info(
      'Tracked-only deletion is enabled - only content from approval system will be deleted',
    )

    try {
      const trackedGuids = await ensureTrackedCache(
        context.trackedGuids,
        config.deleteSyncTrackedOnly,
        context.dbService,
        logger,
      )

      if (!trackedGuids) {
        throw new Error('Failed to retrieve tracked content GUIDs')
      }

      context.setTrackedGuids(trackedGuids)

      logger.info(
        `Found ${trackedGuids.size} tracked content GUIDs in approval system`,
      )
    } catch (trackedError) {
      const errorMsg = `Error retrieving tracked content GUIDs: ${trackedError instanceof Error ? trackedError.message : String(trackedError)}`
      logger.error(
        {
          error:
            trackedError instanceof Error
              ? trackedError
              : new Error(String(trackedError)),
        },
        errorMsg,
      )

      logger.error(errorMsg)
      logger.error('Delete operation aborted to prevent mass deletion.')
      return createSafetyTriggeredResult(
        errorMsg,
        existingSeries.length,
        existingMovies.length,
      )
    }
  }

  // Check if Plex playlist protection is enabled
  if (config.enablePlexPlaylistProtection) {
    logger.info(
      `Plex playlist protection is enabled with playlist name "${context.protectionPlaylistName}"`,
    )

    try {
      // Use cached protection loading to avoid redundant API calls
      const protectedGuids = await ensureProtectionCache(
        context.protectedGuids,
        config.enablePlexPlaylistProtection,
        context.fastify,
        context.protectionPlaylistName,
        logger,
      )

      if (!protectedGuids) {
        throw new Error('Failed to retrieve protected items')
      }

      context.setProtectedGuids(protectedGuids)

      logger.info(
        `Protection playlists "${context.protectionPlaylistName}" contain a total of ${protectedGuids.size} protected GUIDs`,
      )

      // Trace sample of protected identifiers (limited to 5)
      if (protectedGuids.size > 0 && logger.level === 'trace') {
        const sampleGuids = Array.from(protectedGuids).slice(0, 5)
        logger.trace({ sampleGuids }, 'Sample protected GUIDs')
      }
    } catch (protectedItemsError) {
      const errorMsg = `Error retrieving protected items from playlists: ${protectedItemsError instanceof Error ? protectedItemsError.message : String(protectedItemsError)}`
      logger.error(
        {
          error:
            protectedItemsError instanceof Error
              ? protectedItemsError
              : new Error(String(protectedItemsError)),
        },
        errorMsg,
      )

      logger.error(errorMsg)
      logger.error('Delete operation aborted to prevent mass deletion.')
      return createSafetyTriggeredResult(
        errorMsg,
        existingSeries.length,
        existingMovies.length,
      )
    }
  } else {
    logger.debug('Plex playlist protection is disabled')
  }

  // First, run a safety check to prevent mass deletion
  try {
    // Count how many items would be deleted by tag-based deletion
    const [taggedForDeletionSeries, taggedForDeletionMovies] =
      await Promise.all([
        countTaggedSeries(
          existingSeries,
          {
            deleteEndedShow: config.deleteEndedShow,
            deleteContinuingShow: config.deleteContinuingShow,
            deleteMovie: config.deleteMovie,
            enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
            removedTagPrefix: config.removedTagPrefix,
          },
          sonarrManager,
          tagCache,
          context.protectedGuids,
          (guids) => {
            if (!context.protectedGuids) return false
            return guids.some((guid) => context.protectedGuids?.has(guid))
          },
          logger,
        ),
        countTaggedMovies(
          existingMovies,
          {
            deleteEndedShow: config.deleteEndedShow,
            deleteContinuingShow: config.deleteContinuingShow,
            deleteMovie: config.deleteMovie,
            enablePlexPlaylistProtection: config.enablePlexPlaylistProtection,
            removedTagPrefix: config.removedTagPrefix,
          },
          radarrManager,
          tagCache,
          context.protectedGuids,
          (guids) => {
            if (!context.protectedGuids) return false
            return guids.some((guid) => context.protectedGuids?.has(guid))
          },
          logger,
        ),
      ])

    const safetyCheck = performSafetyCheck(
      existingSeries,
      existingMovies,
      taggedForDeletionSeries,
      taggedForDeletionMovies,
      {
        deleteMovie: config.deleteMovie,
        deleteEndedShow: config.deleteEndedShow,
        deleteContinuingShow: config.deleteContinuingShow,
        maxDeletionPrevention: config.maxDeletionPrevention ?? 10,
      },
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

  // Initialize deletion counters
  const counters = new DeletionCounters()

  // Process movie deletions using unified processor
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
      },
      validators: {
        isAnyGuidTracked: (guids) => {
          if (!context.trackedGuids) return false
          return guids.some((guid) => context.trackedGuids?.has(guid))
        },
        isAnyGuidProtected: (guids) => {
          if (!context.protectedGuids) return false
          return guids.some((guid) => context.protectedGuids?.has(guid))
        },
      },
      radarrManager,
      tagCache,
      protectedGuids: context.protectedGuids,
      logger,
      dryRun,
      deletedGuidsTracker: context.deletedMovieGuids,
      playlistName: context.protectionPlaylistName,
    },
    counters,
  )

  // Process show deletions using unified processor
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
      },
      validators: {
        isAnyGuidTracked: (guids) => {
          if (!context.trackedGuids) return false
          return guids.some((guid) => context.trackedGuids?.has(guid))
        },
        isAnyGuidProtected: (guids) => {
          if (!context.protectedGuids) return false
          return guids.some((guid) => context.protectedGuids?.has(guid))
        },
      },
      sonarrManager,
      tagCache,
      protectedGuids: context.protectedGuids,
      logger,
      dryRun,
      deletedGuidsTracker: context.deletedShowGuids,
      playlistName: context.protectionPlaylistName,
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
    `Tag-based delete sync ${dryRun ? '(DRY RUN)' : 'operation'} complete: ${counters.totalDeleted} items identified for deletion, ${counters.totalSkipped} skipped, ${counters.totalProtected} protected, ${counters.totalProcessed} total processed`,
  )

  // Log detailed summary at debug level
  logger.debug(
    {
      ...deletionSummary,
      dryRun,
    },
    `Detailed tag-based deletion ${dryRun ? '(DRY RUN)' : 'operation'} summary`,
  )

  // Resources will be cleared in finally block of run() method

  return deletionSummary
}
