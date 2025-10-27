import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { TagCache, TagService } from '@services/delete-sync/cache/index.js'
import type { DeletionCounters } from '@services/delete-sync/utils/deletion-counters.js'
import type {
  ContentValidators,
  ValidationConfig,
} from '@services/delete-sync/validation/content-validator.js'
import {
  validateTagBasedDeletion,
  validateWatchlistDeletion,
} from '@services/delete-sync/validation/content-validator.js'
import type { RadarrManagerService } from '@services/radarr-manager.service.js'
import type { SonarrManagerService } from '@services/sonarr-manager.service.js'
import { parseGuids } from '@utils/guid-handler.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Configuration for movie deletion
 */
export interface MovieDeletionConfig extends ValidationConfig {
  deleteMovie: boolean
  deleteFiles: boolean
}

/**
 * Configuration for show deletion
 */
export interface ShowDeletionConfig extends ValidationConfig {
  deleteEndedShow: boolean
  deleteContinuingShow: boolean
  deleteFiles: boolean
}

/**
 * Context for movie deletion
 */
export interface MovieDeletionContext {
  movies: RadarrItem[]
  config: MovieDeletionConfig
  validators: ContentValidators
  radarrManager: RadarrManagerService
  tagCache: TagCache
  protectedGuids: Set<string> | null
  logger: FastifyBaseLogger
  dryRun: boolean
  deletedGuidsTracker: Set<string>
  playlistName?: string
}

/**
 * Context for show deletion
 */
export interface ShowDeletionContext {
  shows: SonarrItem[]
  config: ShowDeletionConfig
  validators: ContentValidators
  sonarrManager: SonarrManagerService
  tagCache: TagCache
  protectedGuids: Set<string> | null
  logger: FastifyBaseLogger
  dryRun: boolean
  deletedGuidsTracker: Set<string>
  playlistName?: string
}

/**
 * Process movie deletions in tag-based mode
 *
 * @param context - Movie deletion context
 * @param counters - Deletion counters to update
 */
export async function processMovieDeletions(
  context: MovieDeletionContext,
  counters: DeletionCounters,
): Promise<void> {
  const {
    movies,
    config,
    validators,
    radarrManager,
    tagCache,
    protectedGuids,
    logger,
    dryRun,
    deletedGuidsTracker,
    playlistName,
  } = context

  // Check if movie deletion is enabled
  if (!config.deleteMovie) {
    logger.info('Movie deletion disabled in configuration, skipping')
    return
  }

  // Group movies by instance
  const moviesByInstance = new Map<number, RadarrItem[]>()
  for (const movie of movies) {
    if (movie.radarr_instance_id) {
      if (!moviesByInstance.has(movie.radarr_instance_id)) {
        moviesByInstance.set(movie.radarr_instance_id, [])
      }
      moviesByInstance.get(movie.radarr_instance_id)?.push(movie)
    }
  }

  // Process each instance
  for (const [instanceId, instanceMovies] of moviesByInstance.entries()) {
    for (const movie of instanceMovies) {
      // Skip movies without instance ID
      if (!movie.radarr_instance_id) {
        logger.warn(
          `Movie "${movie.title}" has no Radarr instance ID, skipping deletion`,
        )
        counters.incrementMovieSkipped()
        continue
      }

      try {
        // Get the appropriate Radarr service for this instance
        const service = radarrManager.getRadarrService(instanceId)

        if (!service) {
          logger.warn(
            `Radarr service for instance ${instanceId} not found, skipping deletion of "${movie.title}"`,
          )
          counters.incrementMovieSkipped()
          continue
        }

        // Parse GUIDs once
        const movieGuidList = parseGuids(movie.guids)

        // Validate for deletion
        const validation =
          config.deletionMode === 'tag-based'
            ? await validateTagBasedDeletion(
                instanceId,
                service as TagService,
                movie.tags || [],
                movieGuidList,
                movie.title,
                'radarr',
                config,
                validators,
                tagCache,
                logger,
                protectedGuids,
              )
            : validateWatchlistDeletion(
                movieGuidList,
                movie.title,
                config,
                validators,
                logger,
                protectedGuids,
              )

        // Handle validation results
        if (validation.skip) {
          if (validation.notTracked) {
            counters.incrementMovieSkipped()
          }
          continue
        }

        if (validation.protected) {
          logger.info(
            `Skipping deletion of movie "${movie.title}" as it is protected in Plex playlist "${playlistName || 'Do Not Delete'}"`,
          )
          counters.incrementMovieProtected()
          continue
        }

        // Execute deletion
        if (!dryRun) {
          logger.debug(
            `Deleting movie "${movie.title}" (delete files: ${config.deleteFiles})`,
          )
          await service.deleteFromRadarr(movie, config.deleteFiles)

          // Track deleted GUIDs for approval cleanup
          for (const guid of movieGuidList) {
            deletedGuidsTracker.add(guid)
          }
        } else {
          logger.debug(
            {
              title: movie.title,
              instanceId,
              deleteFiles: config.deleteFiles,
              guids: movieGuidList,
            },
            `[DRY RUN] Movie "${movie.title}" identified for deletion from Radarr instance ${instanceId}`,
          )
        }

        // Record deletion
        counters.incrementMovieDeleted({
          title: movie.title,
          guid: movieGuidList[0] || 'unknown',
          instance: instanceId.toString(),
        })

        if (!dryRun) {
          logger.info(
            {
              title: movie.title,
              instanceId,
              deleteFiles: config.deleteFiles,
              guids: movieGuidList,
            },
            `Successfully deleted movie "${movie.title}" from Radarr instance ${instanceId}`,
          )
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            movie: {
              title: movie.title,
              instanceId: movie.radarr_instance_id,
              guids: movie.guids,
            },
          },
          `Error ${dryRun ? 'processing (DRY RUN)' : 'deleting'} movie "${movie.title}" from instance ${movie.radarr_instance_id}:`,
        )
        counters.incrementMovieSkipped()
      }
    }
  }

  // Summary logging
  const protectionSuffix = config.enablePlexPlaylistProtection
    ? `, ${counters.moviesProtected} protected by playlist "${playlistName || 'Do Not Delete'}"`
    : ''

  logger.info(
    `${config.deletionMode === 'tag-based' ? 'Tag-based ' : ''}movie deletion ${dryRun ? '(DRY RUN) ' : ''}summary: ${counters.moviesDeleted} identified for deletion, ${counters.moviesSkipped} skipped${protectionSuffix}`,
  )
}

/**
 * Process show deletions in tag-based mode
 *
 * @param context - Show deletion context
 * @param counters - Deletion counters to update
 */
export async function processShowDeletions(
  context: ShowDeletionContext,
  counters: DeletionCounters,
): Promise<void> {
  const {
    shows,
    config,
    validators,
    sonarrManager,
    tagCache,
    protectedGuids,
    logger,
    dryRun,
    deletedGuidsTracker,
    playlistName,
  } = context

  // Check if any show deletion is enabled
  if (!config.deleteEndedShow && !config.deleteContinuingShow) {
    logger.info('TV show deletion disabled in configuration, skipping')
    return
  }

  // Group shows by instance
  const showsByInstance = new Map<number, SonarrItem[]>()
  for (const show of shows) {
    if (show.sonarr_instance_id) {
      if (!showsByInstance.has(show.sonarr_instance_id)) {
        showsByInstance.set(show.sonarr_instance_id, [])
      }
      showsByInstance.get(show.sonarr_instance_id)?.push(show)
    }
  }

  // Process each instance
  for (const [instanceId, instanceShows] of showsByInstance.entries()) {
    for (const show of instanceShows) {
      // Determine if show is continuing
      const isContinuing = show.series_status !== 'ended'

      // Skip if this show type is not enabled for deletion
      if (isContinuing && !config.deleteContinuingShow) {
        continue
      }
      if (!isContinuing && !config.deleteEndedShow) {
        continue
      }

      // Skip shows without instance ID
      if (!show.sonarr_instance_id) {
        logger.warn(
          `${isContinuing ? 'Continuing' : 'Ended'} show "${show.title}" has no Sonarr instance ID, skipping deletion`,
        )
        counters.incrementShowSkipped(isContinuing)
        continue
      }

      try {
        // Get the appropriate Sonarr service for this instance
        const service = sonarrManager.getSonarrService(instanceId)

        if (!service) {
          logger.warn(
            `Sonarr service for instance ${instanceId} not found, skipping deletion of "${show.title}"`,
          )
          counters.incrementShowSkipped(isContinuing)
          continue
        }

        // Parse GUIDs once
        const showGuidList = parseGuids(show.guids)

        // Validate for deletion
        const validation =
          config.deletionMode === 'tag-based'
            ? await validateTagBasedDeletion(
                instanceId,
                service as TagService,
                show.tags || [],
                showGuidList,
                show.title,
                'sonarr',
                config,
                validators,
                tagCache,
                logger,
                protectedGuids,
              )
            : validateWatchlistDeletion(
                showGuidList,
                show.title,
                config,
                validators,
                logger,
                protectedGuids,
              )

        // Handle validation results
        if (validation.skip) {
          if (validation.notTracked) {
            counters.incrementShowSkipped(isContinuing)
          }
          continue
        }

        if (validation.protected) {
          logger.info(
            `Skipping deletion of ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" as it is protected in Plex playlist "${playlistName || 'Do Not Delete'}"`,
          )
          counters.incrementShowProtected()
          continue
        }

        // Execute deletion
        if (!dryRun) {
          logger.debug(
            `Deleting ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" (delete files: ${config.deleteFiles})`,
          )
          await service.deleteFromSonarr(show, config.deleteFiles)

          // Track deleted GUIDs for approval cleanup
          for (const guid of showGuidList) {
            deletedGuidsTracker.add(guid)
          }
        } else {
          logger.debug(
            {
              title: show.title,
              instanceId,
              status: isContinuing ? 'continuing' : 'ended',
              deleteFiles: config.deleteFiles,
              guids: showGuidList,
            },
            `[DRY RUN] ${isContinuing ? 'Continuing' : 'Ended'} show "${show.title}" identified for deletion from Sonarr instance ${instanceId}`,
          )
        }

        // Record deletion
        counters.incrementShowDeleted(
          {
            title: show.title,
            guid: showGuidList[0] || 'unknown',
            instance: instanceId.toString(),
          },
          isContinuing,
        )

        if (!dryRun) {
          logger.info(
            {
              title: show.title,
              instanceId,
              status: isContinuing ? 'continuing' : 'ended',
              deleteFiles: config.deleteFiles,
              guids: showGuidList,
            },
            `Successfully deleted ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" from Sonarr instance ${instanceId}`,
          )
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error : new Error(String(error)),
            show: {
              title: show.title,
              instanceId: show.sonarr_instance_id,
              status: isContinuing ? 'continuing' : 'ended',
              guids: show.guids,
            },
          },
          `Error ${dryRun ? 'processing (DRY RUN)' : 'deleting'} show "${show.title}" from instance ${show.sonarr_instance_id}:`,
        )
        counters.incrementShowSkipped(isContinuing)
      }
    }
  }

  // Summary logging
  const protectionSuffix = config.enablePlexPlaylistProtection
    ? `, ${counters.showsProtected} protected by playlist "${playlistName || 'Do Not Delete'}"`
    : ''

  logger.info(
    `${config.deletionMode === 'tag-based' ? 'Tag-based ' : ''}TV show deletion ${dryRun ? '(DRY RUN) ' : ''}summary: ${counters.totalShowsDeleted} identified for deletion (${counters.endedShowsDeleted} ended, ${counters.continuingShowsDeleted} continuing), ${counters.totalShowsSkipped} skipped${protectionSuffix}`,
  )
}
