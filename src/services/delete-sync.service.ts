/**
 * Delete Synchronization Service
 *
 * Responsible for removing content from Sonarr and Radarr that is no longer in any Plex watchlist.
 * This service implements the watchlist-driven content management approach, where content is only
 * kept in your media servers if it's actively watchlisted by at least one user.
 *
 * Responsible for:
 * - Periodically checking for content that should be removed
 * - Enforcing deletion policies based on configuration (movies, ended shows, continuing shows)
 * - Coordinating with Sonarr and Radarr managers to perform actual deletions
 * - Respecting configuration settings for deletion behavior (e.g., whether to delete files)
 * - Handling deletion errors gracefully with comprehensive logging
 * - Providing summary statistics on deletion operations
 *
 * The service runs at a configurable interval and can be triggered manually via API if needed.
 *
 * @example
 * // Running the delete sync manually:
 * await fastify.deleteSync.run();
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'

export class DeleteSyncService {
  /**
   * Creates a new DeleteSyncService instance
   *
   * @param log - Fastify logger instance for recording operations
   * @param fastify - Fastify instance for accessing other services and configuration
   */
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log.info('Initializing Delete Sync Service')
  }

  /**
   * Access to application configuration
   */
  private get config() {
    return this.fastify.config
  }

  /**
   * Access to database service
   */
  private get dbService() {
    return this.fastify.db
  }

  /**
   * Access to Sonarr manager service
   */
  private get sonarrManager() {
    return this.fastify.sonarrManager
  }

  /**
   * Access to Radarr manager service
   */
  private get radarrManager() {
    return this.fastify.radarrManager
  }

  /**
   * Execute a full delete synchronization process
   *
   * This method orchestrates the entire deletion workflow:
   * 1. Checks if deletion is enabled in configuration
   * 2. Retrieves all watchlist items from the database
   * 3. Fetches all content from Sonarr and Radarr instances
   * 4. Identifies content that is not on any watchlist
   * 5. Deletes content based on configuration rules
   *
   * @returns Promise resolving to void when complete
   */
  async run(): Promise<void> {
    try {
      this.log.info('Starting delete sync operation')

      // Skip if deletion features are not enabled in configuration
      if (!this.isDeleteEnabled()) {
        this.log.info(
          'Delete sync is not enabled in configuration, skipping operation',
        )
        return
      }

      this.log.debug('Delete configuration:', {
        deleteMovie: this.config.deleteMovie,
        deleteEndedShow: this.config.deleteEndedShow,
        deleteContinuingShow: this.config.deleteContinuingShow,
        deleteFiles: this.config.deleteFiles,
        deleteIntervalDays: this.config.deleteIntervalDays,
      })

      // Fetch all watchlisted content GUIDs for comparison
      this.log.info('Retrieving all watchlisted content')
      const allWatchlistItems = await this.getAllWatchlistItems()
      this.log.info(
        `Found ${allWatchlistItems.size} unique GUIDs across all watchlists`,
      )

      // Fetch all content from media management servers
      this.log.info('Retrieving all content from Sonarr and Radarr instances')
      const [existingSeries, existingMovies] = await Promise.all([
        this.sonarrManager.fetchAllSeries(),
        this.radarrManager.fetchAllMovies(),
      ])
      this.log.info(
        `Found ${existingSeries.length} series in Sonarr and ${existingMovies.length} movies in Radarr`,
      )

      // Process and execute deletions based on configuration
      await this.processDeleteSync(
        existingSeries,
        existingMovies,
        allWatchlistItems,
      )

      this.log.info('Delete sync operation completed successfully')
    } catch (error) {
      this.log.error('Error in delete sync operation:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  /**
   * Determines if any deletion functionality is enabled in configuration
   *
   * @returns Boolean indicating if at least one deletion type is enabled
   */
  private isDeleteEnabled(): boolean {
    return (
      this.config.deleteMovie ||
      this.config.deleteEndedShow ||
      this.config.deleteContinuingShow
    )
  }

  /**
   * Retrieves all watchlist items from the database and extracts their GUIDs
   *
   * This method builds a comprehensive set of GUIDs from all watchlisted content
   * across all users. This set is used to determine what content should be kept.
   *
   * @returns Promise resolving to Set of all GUIDs currently on any watchlist
   */
  private async getAllWatchlistItems(): Promise<Set<string>> {
    // Retrieve all watchlist items for both movies and shows
    const [shows, movies] = await Promise.all([
      this.dbService.getAllShowWatchlistItems(),
      this.dbService.getAllMovieWatchlistItems(),
    ])

    this.log.debug(
      `Found ${shows.length} show watchlist items and ${movies.length} movie watchlist items`,
    )

    // Create a set of all GUIDs for efficient lookup
    const guidSet = new Set<string>()
    let malformedItems = 0

    // Process all items to extract GUIDs
    for (const item of [...shows, ...movies]) {
      try {
        // Handle GUIDs stored as either JSON string or array
        const guids =
          typeof item.guids === 'string'
            ? JSON.parse(item.guids)
            : item.guids || []

        // Add each GUID to the set for efficient lookup
        for (const guid of guids) {
          guidSet.add(guid)
        }
      } catch (error) {
        malformedItems++
        this.log.warn(`Malformed guids in watchlist item "${item.title}":`, {
          error: error instanceof Error ? error.message : String(error),
          guids: item.guids,
        })
      }
    }

    if (malformedItems > 0) {
      this.log.warn(
        `Found ${malformedItems} watchlist items with malformed GUIDs`,
      )
    }

    this.log.debug(
      `Extracted ${guidSet.size} unique GUIDs from watchlist items`,
    )
    return guidSet
  }

  /**
   * Process and execute deletions based on configuration rules
   *
   * This core method identifies content that should be deleted (not present in any
   * watchlist) and executes the deletion operations based on the configured deletion
   * policies. It handles both movies and TV shows with appropriate categorization.
   *
   * @param existingSeries - Array of all series found in Sonarr instances
   * @param existingMovies - Array of all movies found in Radarr instances
   * @param watchlistGuids - Set of all GUIDs that exist in watchlists
   * @returns Promise resolving to void when complete
   */
  private async processDeleteSync(
    existingSeries: SonarrItem[],
    existingMovies: RadarrItem[],
    watchlistGuids: Set<string>,
  ): Promise<void> {
    let moviesDeleted = 0
    let moviesSkipped = 0
    let endedShowsDeleted = 0
    let endedShowsSkipped = 0
    let continuingShowsDeleted = 0
    let continuingShowsSkipped = 0

    this.log.info('Beginning deletion process based on configuration')

    // Process movies if movie deletion is enabled
    if (this.config.deleteMovie) {
      this.log.info(
        `Processing ${existingMovies.length} movies for potential deletion`,
      )

      for (const movie of existingMovies) {
        // Check if movie exists in any watchlist
        const exists = movie.guids.some((guid) => watchlistGuids.has(guid))

        if (!exists) {
          const instanceId = movie.radarr_instance_id

          // Skip movies without instance ID
          if (!instanceId) {
            this.log.warn(
              `Movie "${movie.title}" has no Radarr instance ID, skipping deletion`,
            )
            moviesSkipped++
            continue
          }

          try {
            // Get the appropriate Radarr service for this instance
            const service = this.radarrManager.getRadarrService(instanceId)

            if (!service) {
              this.log.warn(
                `Radarr service for instance ${instanceId} not found, skipping deletion of "${movie.title}"`,
              )
              moviesSkipped++
              continue
            }

            // Execute the deletion operation
            this.log.debug(
              `Deleting movie "${movie.title}" (delete files: ${this.config.deleteFiles})`,
            )
            await service.deleteFromRadarr(movie, this.config.deleteFiles)
            moviesDeleted++

            this.log.info(
              `Successfully deleted movie "${movie.title}" from Radarr instance ${instanceId}`,
              {
                title: movie.title,
                instanceId,
                deleteFiles: this.config.deleteFiles,
                guids: movie.guids,
              },
            )
          } catch (error) {
            this.log.error(
              `Error deleting movie "${movie.title}" from instance ${movie.radarr_instance_id}:`,
              {
                error: error instanceof Error ? error.message : String(error),
                movie: {
                  title: movie.title,
                  instanceId: movie.radarr_instance_id,
                  guids: movie.guids,
                },
              },
            )
            moviesSkipped++
          }
        }
      }

      const movieSummary = {
        deleted: moviesDeleted,
        skipped: moviesSkipped,
      }
      this.log.info(`Movie deletion summary: ${JSON.stringify(movieSummary)}`)
    } else {
      this.log.info('Movie deletion disabled in configuration, skipping')
    }

    // Process TV shows if any show deletion is enabled
    if (this.config.deleteEndedShow || this.config.deleteContinuingShow) {
      this.log.info(
        `Processing ${existingSeries.length} TV shows for potential deletion`,
      )

      for (const show of existingSeries) {
        // Check if show exists in any watchlist
        const exists = show.guids.some((guid) => watchlistGuids.has(guid))

        if (!exists) {
          // Determine if this is a continuing or ended show
          const isContinuing = show.series_status !== 'ended'

          // Check if this show type should be deleted based on configuration
          const shouldDelete = isContinuing
            ? this.config.deleteContinuingShow
            : this.config.deleteEndedShow

          if (!shouldDelete) {
            this.log.debug(
              `Skipping ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" - deletion disabled in config`,
            )

            if (isContinuing) {
              continuingShowsSkipped++
            } else {
              endedShowsSkipped++
            }
            continue
          }

          const instanceId = show.sonarr_instance_id

          // Skip shows without instance ID
          if (!instanceId) {
            this.log.warn(
              `Show "${show.title}" has no Sonarr instance ID, skipping deletion`,
            )

            if (isContinuing) {
              continuingShowsSkipped++
            } else {
              endedShowsSkipped++
            }
            continue
          }

          try {
            // Get the appropriate Sonarr service for this instance
            const service = this.sonarrManager.getSonarrService(instanceId)

            if (!service) {
              this.log.warn(
                `Sonarr service for instance ${instanceId} not found, skipping deletion of "${show.title}"`,
              )

              if (isContinuing) {
                continuingShowsSkipped++
              } else {
                endedShowsSkipped++
              }
              continue
            }

            // Execute the deletion operation
            this.log.debug(
              `Deleting ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" (delete files: ${this.config.deleteFiles})`,
            )
            await service.deleteFromSonarr(show, this.config.deleteFiles)

            // Update appropriate counter based on show type
            if (isContinuing) {
              continuingShowsDeleted++
            } else {
              endedShowsDeleted++
            }

            this.log.info(
              `Successfully deleted ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" from Sonarr instance ${instanceId}`,
              {
                title: show.title,
                instanceId,
                status: isContinuing ? 'continuing' : 'ended',
                deleteFiles: this.config.deleteFiles,
                guids: show.guids,
              },
            )
          } catch (error) {
            this.log.error(
              `Error deleting show "${show.title}" from instance ${show.sonarr_instance_id}:`,
              {
                error: error instanceof Error ? error.message : String(error),
                show: {
                  title: show.title,
                  instanceId: show.sonarr_instance_id,
                  status: isContinuing ? 'continuing' : 'ended',
                  guids: show.guids,
                },
              },
            )

            if (isContinuing) {
              continuingShowsSkipped++
            } else {
              endedShowsSkipped++
            }
          }
        }
      }

      const tvShowSummary = {
        endedShows: {
          deleted: endedShowsDeleted,
          skipped: endedShowsSkipped,
        },
        continuingShows: {
          deleted: continuingShowsDeleted,
          skipped: continuingShowsSkipped,
        },
      }
      this.log.info(
        `TV show deletion summary: ${JSON.stringify(tvShowSummary)}`,
      )
    } else {
      this.log.info('TV show deletion disabled in configuration, skipping')
    }

    // Log overall summary statistics
    const totalDeleted =
      moviesDeleted + endedShowsDeleted + continuingShowsDeleted
    const totalSkipped =
      moviesSkipped + endedShowsSkipped + continuingShowsSkipped

    const deletionSummary = {
      movies: {
        deleted: moviesDeleted,
        skipped: moviesSkipped,
      },
      shows: {
        ended: {
          deleted: endedShowsDeleted,
          skipped: endedShowsSkipped,
        },
        continuing: {
          deleted: continuingShowsDeleted,
          skipped: continuingShowsSkipped,
        },
      },
      total: {
        deleted: totalDeleted,
        skipped: totalSkipped,
        processed: totalDeleted + totalSkipped,
      },
    }

    this.log.info(
      `Delete sync operation summary: ${JSON.stringify(deletionSummary)}`,
    )
  }
}
