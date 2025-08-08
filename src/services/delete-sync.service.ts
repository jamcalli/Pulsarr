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
import type {
  Item as SonarrItem,
  SonarrSeries,
} from '@root/types/sonarr.types.js'
import type {
  Item as RadarrItem,
  RadarrMovie,
} from '@root/types/radarr.types.js'
import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import { PlexServerService } from '@utils/plex-server.js'
import {
  parseGuids,
  extractRadarrId,
  extractSonarrId,
} from '@utils/guid-handler.js'

// Define the WatchlistItem interface for type assertions
interface WatchlistItem {
  title: string
  key: string
  type: string
  thumb?: string
  added?: string
  guids?: string[] | string
  genres?: string[] | string
  user_id: number
  status: 'pending' | 'requested' | 'grabbed' | 'notified'
  series_status?: 'continuing' | 'ended'
  movie_status?: 'available' | 'unavailable'
  sonarr_instance_id?: number
  radarr_instance_id?: number
  last_notified_at?: string
  sync_started_at?: string
  created_at: string
  updated_at: string
  id?: string
}

export class DeleteSyncService {
  /**
   * Plex server service instance for playlist protection
   */
  private readonly plexServer: PlexServerService

  /**
   * Cache of protected GUIDs for efficient lookup
   */
  private protectedGuids: Set<string> | null = null

  /**
   * Cache of tags by instance for efficient lookup during tag-based deletion
   */
  private tagCache: Map<number, Map<number, string>> = new Map()

  /**
   * Flag to prevent concurrent runs of the delete sync process
   */
  private _running = false

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
    this.plexServer = new PlexServerService(this.log, this.fastify)
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
   * Initialize the service and its dependencies
   */
  async initialize(): Promise<boolean> {
    try {
      // Initialize Plex server service
      const initialized = await this.plexServer.initialize()
      if (!initialized) {
        this.log.error('Failed to initialize Plex server service')
        return false
      }

      this.log.info('Delete Sync Service initialized successfully')
      return true
    } catch (error) {
      this.log.error('Error initializing Delete Sync Service:', error)
      return false
    }
  }

  /**
   * Execute a full delete synchronization process
   *
   * This method orchestrates the entire deletion workflow based on the configured deletion mode:
   * - watchlist mode: removes content that is not on any watchlist
   * - tag-based mode: removes content that has the specified removal tag
   *
   * Both modes follow the same safety checks and notification procedures.
   *
   * @returns Promise resolving to detailed results of the delete operation
   */
  async run(dryRun = false): Promise<{
    total: {
      deleted: number
      skipped: number
      processed: number
      protected?: number
    }
    movies: {
      deleted: number
      skipped: number
      protected?: number
      items: Array<{ title: string; guid: string; instance: string }>
    }
    shows: {
      deleted: number
      skipped: number
      protected?: number
      items: Array<{ title: string; guid: string; instance: string }>
    }
    safetyTriggered?: boolean
    safetyMessage?: string
  }> {
    // Check if delete sync is already running
    if (this._running) {
      this.log.warn(
        'Delete-sync already in progress – ignoring duplicate trigger',
      )
      return this.createEmptyResult('Duplicate delete-sync run skipped')
    }

    this._running = true
    try {
      const deletionMode = this.getDeletionMode()
      this.log.info(
        `Starting delete sync operation in ${deletionMode} mode${dryRun ? ' (DRY RUN)' : ''}`,
      )

      // Clear tag cache at the start of each run
      this.clearTagCache()

      // Make sure the Plex server is initialized if needed
      if (
        this.config.enablePlexPlaylistProtection &&
        !this.plexServer.isInitialized()
      ) {
        this.log.info(
          'Plex playlist protection enabled but not initialized - initializing now',
        )
        await this.initialize()
      }

      // Step 1: Skip if deletion features are not enabled in configuration
      if (!this.isDeleteEnabled()) {
        return this.createEmptyResult(
          'Delete sync is not enabled in configuration, skipping operation',
        )
      }

      this.logDeleteConfiguration(dryRun)

      // Step 2: Fetch all content from media management servers
      const { existingSeries, existingMovies } =
        await this.fetchAllMediaContent()

      // Step 3: Update user tags before processing deletion (especially important for tag-based deletion)
      const shouldUpdateTags = deletionMode === 'tag-based'
      if (shouldUpdateTags) {
        // Refresh watchlists to ensure we detect newly removed items
        const refreshResult = await this.refreshWatchlists()
        if (!refreshResult.success) {
          return this.createSafetyTriggeredResult(refreshResult.message, dryRun)
        }

        await this.updateUserTags(existingSeries, existingMovies)
      }

      let result: DeleteSyncResult

      // Branch based on deletion mode
      if (deletionMode === 'tag-based') {
        // Tag-based deletion workflow
        this.log.info(
          `Running tag-based deletion using tag "${this.config.removedTagPrefix}"`,
        )

        // Step 3: If tag-based mode, process using tag-based workflow
        result = await this.processTagBasedDeleteSync(
          existingSeries,
          existingMovies,
          dryRun,
        )
      } else {
        // Traditional watchlist-based deletion workflow

        // Step 3: Refresh watchlists to ensure current data
        const refreshResult = await this.refreshWatchlists()
        if (!refreshResult.success) {
          return this.createSafetyTriggeredResult(refreshResult.message, dryRun)
        }

        // Step 4: Get all watchlisted content GUIDs
        const allWatchlistItems = await this.getAllWatchlistItems(
          this.config.respectUserSyncSetting,
        )

        // Step 5: Ensure we have at least some watchlist items (safety check)
        if (allWatchlistItems.size === 0) {
          return this.createSafetyTriggeredResult(
            'No watchlist items found - this could be an error condition. Aborting delete sync to prevent mass deletion.',
            dryRun,
          )
        }

        this.log.info(
          `Found ${allWatchlistItems.size} unique GUIDs across all watchlists${this.config.respectUserSyncSetting ? ' (respecting user sync settings)' : ''}`,
        )

        // Step 6: Perform safety check for mass deletion prevention
        const safetyResult = this.performSafetyCheck(
          existingSeries,
          existingMovies,
          allWatchlistItems,
        )

        if (!safetyResult.safe) {
          return this.createSafetyTriggeredResult(
            safetyResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        // Additional safety check: If Plex playlist protection is enabled but Plex server isn't properly initialized
        if (
          this.config.enablePlexPlaylistProtection &&
          !this.plexServer.isInitialized()
        ) {
          return this.createSafetyTriggeredResult(
            'Plex playlist protection is enabled but Plex server is not properly initialized - cannot proceed with deletion to ensure content safety',
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        // Step 7: If everything is safe, proceed with the actual watchlist-based processing
        result = await this.processDeleteSync(
          existingSeries,
          existingMovies,
          allWatchlistItems,
          dryRun,
        )
      }

      this.log.info(
        `Delete sync operation ${dryRun ? 'simulation' : ''} completed successfully`,
      )

      // Step 8: Send notifications about results if enabled
      await this.sendNotificationsIfEnabled(result, dryRun)

      return result
    } catch (error) {
      this.logError('Error in delete sync operation:', error)
      throw error
    } finally {
      this._running = false
    }
  }

  /**
   * Creates an empty result object when deletion is skipped
   */
  private createEmptyResult(logMessage: string): DeleteSyncResult {
    this.log.info(logMessage)
    return {
      total: { deleted: 0, skipped: 0, processed: 0, protected: 0 },
      movies: { deleted: 0, skipped: 0, protected: 0, items: [] },
      shows: { deleted: 0, skipped: 0, protected: 0, items: [] },
    }
  }

  /**
   * Creates a result object for when safety was triggered
   */
  private createSafetyTriggeredResult(
    message: string,
    dryRun: boolean,
    seriesCount = 0,
    moviesCount = 0,
  ): DeleteSyncResult {
    this.log.error(message)
    this.log.error('Delete operation aborted to prevent mass deletion.')

    const result = {
      total: {
        deleted: 0,
        skipped: seriesCount + moviesCount,
        protected: 0,
        processed: seriesCount + moviesCount,
      },
      movies: {
        deleted: 0,
        skipped: moviesCount,
        protected: 0,
        items: [],
      },
      shows: {
        deleted: 0,
        skipped: seriesCount,
        protected: 0,
        items: [],
      },
      safetyTriggered: true,
      safetyMessage: message,
    }

    // Send notification about the safety trigger if enabled
    this.sendNotificationsIfEnabled(result, dryRun).catch((error) => {
      this.logError('Error sending delete sync notification:', error)
    })

    return result
  }

  /**
   * Logs the current delete configuration
   */
  private logDeleteConfiguration(dryRun: boolean): void {
    this.log.debug('Delete configuration:', {
      deletionMode: this.config.deletionMode ?? 'watchlist',
      deleteMovie: this.config.deleteMovie,
      deleteEndedShow: this.config.deleteEndedShow,
      deleteContinuingShow: this.config.deleteContinuingShow,
      deleteFiles: this.config.deleteFiles,
      respectUserSyncSetting: this.config.respectUserSyncSetting,
      deleteSyncNotify: this.config.deleteSyncNotify,
      enablePlexPlaylistProtection: this.config.enablePlexPlaylistProtection,
      plexProtectionPlaylistName: this.config.plexProtectionPlaylistName,
      removedTagPrefix: this.config.removedTagPrefix ?? '<not-set>',
      dryRun: dryRun,
    })
  }

  /**
   * Refreshes all watchlists to ensure current data
   */
  private async refreshWatchlists(): Promise<{
    success: boolean
    message: string
  }> {
    this.log.info('Refreshing watchlists to ensure we have current data')
    try {
      await Promise.all([
        this.fastify.plexWatchlist.getSelfWatchlist(),
        this.fastify.plexWatchlist.getOthersWatchlists(),
      ])
      this.log.info('Watchlists refreshed successfully')
      return { success: true, message: 'Watchlists refreshed successfully' }
    } catch (refreshError) {
      const errorMessage = `Failed to refresh watchlist data: ${
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      }`
      this.log.error('Error refreshing watchlist data:', refreshError)
      return { success: false, message: errorMessage }
    }
  }

  /**
   * Fetches all content from media management servers
   */
  private async fetchAllMediaContent(): Promise<{
    existingSeries: SonarrItem[]
    existingMovies: RadarrItem[]
  }> {
    this.log.info('Retrieving all content from Sonarr and Radarr instances')
    const [existingSeries, existingMovies] = await Promise.all([
      this.sonarrManager.fetchAllSeries(true), // Pass true to bypass exclusions (we don't want exclusions in deletion decisions)
      this.radarrManager.fetchAllMovies(true), // Pass true to bypass exclusions (we don't want exclusions in deletion decisions)
    ])
    this.log.info(
      `Found ${existingSeries.length} series in Sonarr and ${existingMovies.length} movies in Radarr`,
    )
    return { existingSeries, existingMovies }
  }

  /**
   * Performs safety check to prevent mass deletion
   */
  private performSafetyCheck(
    existingSeries: SonarrItem[],
    existingMovies: RadarrItem[],
    allWatchlistItems: Set<string>,
  ): { safe: boolean; message: string } {
    // Calculate deletion percentages by doing a count of items that would be deleted
    let potentialMovieDeletes = 0
    let potentialShowDeletes = 0
    const totalMediaItems = existingSeries.length + existingMovies.length

    // Count movies not in watchlist
    for (const movie of existingMovies) {
      const exists = movie.guids.some((guid) => allWatchlistItems.has(guid))
      if (!exists) {
        potentialMovieDeletes++
      }
    }

    // Count shows not in watchlist
    for (const show of existingSeries) {
      const exists = show.guids.some((guid) => allWatchlistItems.has(guid))
      if (!exists) {
        potentialShowDeletes++
      }
    }

    const totalPotentialDeletes = potentialMovieDeletes + potentialShowDeletes
    const potentialDeletionPercentage =
      totalMediaItems > 0 ? (totalPotentialDeletes / totalMediaItems) * 100 : 0

    // Prevent mass deletion if percentage is too high
    const MAX_DELETION_PERCENTAGE = Number(
      this.config.maxDeletionPrevention ?? 10,
    ) // Default to 10% as configured in the database

    if (Number.isNaN(MAX_DELETION_PERCENTAGE) || MAX_DELETION_PERCENTAGE <= 0) {
      throw new Error(
        `Invalid maxDeletionPrevention value: "${this.config.maxDeletionPrevention}". Please set a percentage > 0.`,
      )
    }

    if (potentialDeletionPercentage > MAX_DELETION_PERCENTAGE) {
      return {
        safe: false,
        message: `Safety check failed: Would delete ${totalPotentialDeletes} out of ${totalMediaItems} items (${potentialDeletionPercentage.toFixed(2)}%), which exceeds maximum allowed percentage of ${MAX_DELETION_PERCENTAGE}%.`,
      }
    }

    return { safe: true, message: 'Safety check passed' }
  }

  /**
   * Sends notifications about delete sync results if enabled
   */
  private async sendNotificationsIfEnabled(
    result: DeleteSyncResult,
    dryRun: boolean,
  ): Promise<void> {
    const notifySetting = this.config.deleteSyncNotify || 'none'

    // Skip all notifications if set to none
    if (notifySetting === 'none') {
      this.log.info(
        'Delete sync notifications disabled, skipping all notifications',
      )
      return
    }

    // Check if we should only notify when items were actually deleted
    if (
      this.config.deleteSyncNotifyOnlyOnDeletion &&
      result.total.deleted === 0
    ) {
      this.log.info(
        'Delete sync completed with no deletions, skipping notification as per configuration',
      )
      return
    }

    const sendDiscord = [
      'all',
      'discord-only',
      'discord-webhook',
      'discord-message',
      'discord-both',
      'webhook-only',
      'dm-only',
    ].includes(notifySetting)

    const sendApprise = ['all', 'apprise-only'].includes(notifySetting)

    // Discord notification logic
    if (sendDiscord && this.fastify.discord) {
      try {
        // Pass notification preference to control webhook vs DM
        await this.fastify.discord.sendDeleteSyncNotification(
          result,
          dryRun,
          notifySetting,
        )
      } catch (notifyError) {
        this.log.error(
          'Error sending delete sync Discord notification:',
          notifyError,
        )
      }
    }

    // Apprise notification logic
    if (sendApprise && this.fastify.apprise?.isEnabled()) {
      try {
        await this.fastify.apprise?.sendDeleteSyncNotification(result, dryRun)
      } catch (notifyError) {
        this.log.error(
          'Error sending delete sync Apprise notification:',
          notifyError,
        )
      }
    }
  }

  /**
   * Helper method to log errors with consistent format
   */
  private logError(message: string, error: unknown): void {
    this.log.error(message, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }

  /**
   * Updates user tags for all instances before deletion processing
   * @param existingSeries - Already fetched series data to avoid duplicate API calls
   * @param existingMovies - Already fetched movies data to avoid duplicate API calls
   */
  private async updateUserTags(
    existingSeries: SonarrItem[],
    existingMovies: RadarrItem[],
  ): Promise<void> {
    this.log.info('Updating user tags before delete sync')

    try {
      const userTagService = this.fastify.userTags
      if (!userTagService) {
        this.log.warn('UserTagService not available, skipping tag update')
        return
      }

      // Get all watchlist items
      const movieWatchlistItems =
        await this.fastify.db.getAllMovieWatchlistItems()
      const showWatchlistItems =
        await this.fastify.db.getAllShowWatchlistItems()

      // Tag content using the data - these methods create tags and apply them
      // The service will handle all the tag creation and application internally
      if (this.config.tagUsersInRadarr && existingMovies.length > 0) {
        await userTagService.tagRadarrContentWithData(
          existingMovies,
          movieWatchlistItems,
        )
      }

      if (this.config.tagUsersInSonarr && existingSeries.length > 0) {
        await userTagService.tagSonarrContentWithData(
          existingSeries,
          showWatchlistItems,
        )
      }

      this.log.info('User tags updated successfully')
    } catch (error) {
      this.log.error('Error updating user tags:', error)
      throw new Error('Failed to update user tags before delete sync')
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
   * Determines which deletion mode is active
   *
   * @returns The active deletion mode ('watchlist' or 'tag-based')
   */
  private getDeletionMode(): 'watchlist' | 'tag-based' {
    return this.config.deletionMode || 'watchlist'
  }

  /**
   * Process and execute deletions based on tag presence
   *
   * This method identifies content that has the configured removal tag
   * and executes the deletion operations. It handles both movies and TV shows
   * and follows similar safety checks as the watchlist-based deletion.
   *
   * @param existingSeries - Array of all series found in Sonarr instances
   * @param existingMovies - Array of all movies found in Radarr instances
   * @param dryRun - Whether to simulate the operation without making changes
   * @returns Promise resolving to detailed results of the delete operation
   */
  private async processTagBasedDeleteSync(
    existingSeries: SonarrItem[],
    existingMovies: RadarrItem[],
    dryRun = false,
  ): Promise<DeleteSyncResult> {
    let moviesDeleted = 0
    let moviesSkipped = 0
    let moviesProtected = 0
    let endedShowsDeleted = 0
    let endedShowsSkipped = 0
    let showsProtected = 0
    let continuingShowsDeleted = 0
    let continuingShowsSkipped = 0

    // Arrays to collect details about what would be deleted
    const moviesToDelete: Array<{
      title: string
      guid: string
      instance: string
    }> = []
    const showsToDelete: Array<{
      title: string
      guid: string
      instance: string
    }> = []

    this.log.info(
      `Beginning tag-based deletion ${dryRun ? 'analysis' : 'process'} using tag "${this.config.removedTagPrefix}"`,
    )

    // Reset workflow caches before processing
    this.plexServer.clearWorkflowCaches()

    // Check if Plex playlist protection is enabled
    if (this.config.enablePlexPlaylistProtection) {
      this.log.info(
        `Plex playlist protection is enabled with playlist name "${this.getProtectionPlaylistName()}"`,
      )

      try {
        // Create protection playlists for users if missing
        const playlistMap =
          await this.plexServer.getOrCreateProtectionPlaylists(true)

        if (playlistMap.size === 0) {
          const errorMsg = `Could not find or create protection playlists "${this.getProtectionPlaylistName()}" for any users - Plex server may be unreachable`
          this.log.error(errorMsg)
          return this.createSafetyTriggeredResult(
            errorMsg,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        try {
          // Populate protected GUIDs cache for lookup operations
          this.protectedGuids = await this.plexServer.getProtectedItems()

          if (!this.protectedGuids) {
            throw new Error('Failed to retrieve protected items')
          }

          this.log.info(
            `Protection playlists "${this.getProtectionPlaylistName()}" for ${playlistMap.size} users contain a total of ${this.protectedGuids.size} protected GUIDs`,
          )

          // Debug sample of protected identifiers (limited to 5)
          if (
            this.protectedGuids.size > 0 &&
            (this.log.level === 'debug' || this.log.level === 'trace')
          ) {
            const sampleGuids = Array.from(this.protectedGuids).slice(0, 5)
            this.log.debug('Sample protected GUIDs:')
            for (const guid of sampleGuids) {
              this.log.debug(`  Protected GUID: "${guid}"`)
            }
          }
        } catch (protectedItemsError) {
          const errorMsg = `Error retrieving protected items from playlists: ${protectedItemsError instanceof Error ? protectedItemsError.message : String(protectedItemsError)}`
          this.log.error(errorMsg)
          return this.createSafetyTriggeredResult(
            errorMsg,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }
      } catch (playlistError) {
        const errorMsg = `Error creating or retrieving protection playlists: ${playlistError instanceof Error ? playlistError.message : String(playlistError)}`
        this.log.error(errorMsg)
        return this.createSafetyTriggeredResult(
          errorMsg,
          dryRun,
          existingSeries.length,
          existingMovies.length,
        )
      }
    } else {
      this.log.debug('Plex playlist protection is disabled')
    }

    // First, run a safety check to prevent mass deletion
    try {
      // Count how many items would be deleted by tag-based deletion
      const [taggedForDeletionSeries, taggedForDeletionMovies] =
        await Promise.all([
          this.countTaggedSeries(existingSeries),
          this.countTaggedMovies(existingMovies),
        ])

      const totalItems = existingSeries.length + existingMovies.length
      const totalTaggedItems = taggedForDeletionSeries + taggedForDeletionMovies

      if (totalItems === 0) {
        this.log.warn('No content found in media servers')
        return this.createEmptyResult('No content found in media servers')
      }

      const taggedPercentage = (totalTaggedItems / totalItems) * 100

      this.log.info(
        `Tag-based deletion would affect ${totalTaggedItems} items out of ${totalItems} (${taggedPercentage.toFixed(2)}%)`,
      )

      // Prevent mass deletion if percentage is too high
      const MAX_DELETION_PERCENTAGE = Number(
        this.config.maxDeletionPrevention ?? 10,
      )
      if (
        Number.isNaN(MAX_DELETION_PERCENTAGE) ||
        MAX_DELETION_PERCENTAGE <= 0
      ) {
        throw new Error(
          `Invalid maxDeletionPrevention value: "${this.config.maxDeletionPrevention}". Please set a percentage > 0.`,
        )
      }
      if (taggedPercentage > MAX_DELETION_PERCENTAGE) {
        return this.createSafetyTriggeredResult(
          `Safety check failed: Would delete ${totalTaggedItems} out of ${totalItems} items (${taggedPercentage.toFixed(2)}%), which exceeds maximum allowed percentage of ${MAX_DELETION_PERCENTAGE}%.`,
          dryRun,
          existingSeries.length,
          existingMovies.length,
        )
      }
    } catch (error) {
      this.log.error(
        'Error during safety analysis for tag-based deletion:',
        error,
      )
      return this.createSafetyTriggeredResult(
        `Error during safety analysis: ${error instanceof Error ? error.message : String(error)}`,
        dryRun,
        existingSeries.length,
        existingMovies.length,
      )
    }

    // Process movies if movie deletion is enabled
    if (this.config.deleteMovie) {
      this.log.info(
        `Processing ${existingMovies.length} movies for tag-based deletion${dryRun ? ' (DRY RUN)' : ''}`,
      )

      for (const movie of existingMovies) {
        // Extract Radarr ID
        const radarrId = extractRadarrId(movie.guids)
        if (radarrId === 0) {
          this.log.warn(
            `Movie "${movie.title}" has no valid Radarr ID, skipping deletion check`,
          )
          moviesSkipped++
          continue
        }

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

          // Get full movie details to check for tags
          const movieDetails = await service.getFromRadarr<RadarrMovie>(
            `movie/${radarrId}`,
          )

          // Check if the movie has our removal tag
          const hasRemovalTag = await this.hasRemovalTag(
            instanceId,
            service,
            movieDetails.tags || [],
          )

          if (!hasRemovalTag) {
            // Skip this movie as it doesn't have the removal tag
            continue
          }

          // Check if the movie is protected based on its GUIDs
          if (this.config.enablePlexPlaylistProtection) {
            // Double-check if protectedGuids is correctly initialized
            if (!this.protectedGuids) {
              const errorMsg = `Plex playlist protection is enabled but protected GUIDs weren't properly loaded for movie "${movie.title}" - cannot proceed with deletion`
              this.log.error(errorMsg)
              return this.createSafetyTriggeredResult(
                errorMsg,
                dryRun,
                existingSeries.length,
                existingMovies.length,
              )
            }

            // Check for any movie GUID in the protected set
            const movieGuidList = parseGuids(movie.guids)
            let isProtected = false

            for (const guid of movieGuidList) {
              if (this.protectedGuids.has(guid)) {
                this.log.debug(
                  `Movie "${movie.title}" is protected by GUID "${guid}"`,
                )
                isProtected = true
                break
              }
            }

            if (isProtected) {
              this.log.info(
                `Skipping deletion of movie "${movie.title}" as it is protected in Plex playlist "${this.getProtectionPlaylistName()}"`,
              )
              moviesProtected++
              continue
            }
          }

          // Add to the list of movies to delete (or would delete in dry run)
          const movieGuidList = parseGuids(movie.guids)
          moviesToDelete.push({
            title: movie.title,
            guid: movieGuidList[0] || 'unknown',
            instance: instanceId.toString(),
          })

          if (!dryRun) {
            // Actually execute the deletion operation
            this.log.debug(
              `Deleting movie "${movie.title}" (delete files: ${this.config.deleteFiles})`,
            )
            await service.deleteFromRadarr(movie, this.config.deleteFiles)
          } else {
            this.log.debug(
              `[DRY RUN] Movie "${movie.title}" identified for deletion from Radarr instance ${instanceId}`,
              {
                title: movie.title,
                instanceId,
                deleteFiles: this.config.deleteFiles,
                guids: movieGuidList,
              },
            )
          }

          moviesDeleted++

          if (!dryRun) {
            this.log.info(
              `Successfully deleted movie "${movie.title}" from Radarr instance ${instanceId}`,
              {
                title: movie.title,
                instanceId,
                deleteFiles: this.config.deleteFiles,
                guids: movieGuidList,
              },
            )
          }
        } catch (error) {
          this.log.error(
            `Error ${dryRun ? 'analyzing' : 'deleting'} movie "${movie.title}" from instance ${movie.radarr_instance_id}:`,
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

      const movieSummary = {
        deleted: moviesDeleted,
        skipped: moviesSkipped,
        protected: moviesProtected,
      }
      this.log.info(
        `Tag-based movie deletion ${dryRun ? 'analysis' : ''} summary: ${moviesDeleted} identified for deletion, ${moviesSkipped} skipped, ${moviesProtected} protected by playlist "${this.getProtectionPlaylistName()}"`,
      )
    } else {
      this.log.info('Movie deletion disabled in configuration, skipping')
    }

    // Process TV shows if any show deletion is enabled
    if (this.config.deleteEndedShow || this.config.deleteContinuingShow) {
      this.log.info(
        `Processing ${existingSeries.length} TV shows for tag-based deletion${dryRun ? ' (DRY RUN)' : ''}`,
      )

      for (const show of existingSeries) {
        // Extract Sonarr ID
        const sonarrId = extractSonarrId(show.guids)
        if (sonarrId === 0) {
          this.log.warn(
            `Show "${show.title}" has no valid Sonarr ID, skipping deletion check`,
          )
          if (show.series_status !== 'ended') {
            continuingShowsSkipped++
          } else {
            endedShowsSkipped++
          }
          continue
        }

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

          // Get full series details to check for tags
          const seriesDetails = await service.getFromSonarr<SonarrSeries>(
            `series/${sonarrId}`,
          )

          // Check if the series has our removal tag
          const hasRemovalTag = await this.hasRemovalTag(
            instanceId,
            service,
            seriesDetails.tags || [],
          )

          if (!hasRemovalTag) {
            // Skip this series as it doesn't have the removal tag
            continue
          }

          // Check if the show is protected based on its GUIDs
          if (this.config.enablePlexPlaylistProtection) {
            // Double-check if protectedGuids is correctly initialized
            if (!this.protectedGuids) {
              const errorMsg = `Plex playlist protection is enabled but protected GUIDs weren't properly loaded for show "${show.title}" - cannot proceed with deletion`
              this.log.error(errorMsg)
              return this.createSafetyTriggeredResult(
                errorMsg,
                dryRun,
                existingSeries.length,
                existingMovies.length,
              )
            }

            // Check for any show GUID in the protected set
            const showGuidList = parseGuids(show.guids)
            let isProtected = false

            for (const guid of showGuidList) {
              if (this.protectedGuids.has(guid)) {
                this.log.debug(
                  `Show "${show.title}" is protected by GUID "${guid}"`,
                )
                isProtected = true
                break
              }
            }

            if (isProtected) {
              this.log.info(
                `Skipping deletion of ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" as it is protected in Plex playlist "${this.getProtectionPlaylistName()}"`,
              )
              showsProtected++
              continue
            }
          }

          // Add to the list of shows to delete (or would delete in dry run)
          const showGuidList = parseGuids(show.guids)
          showsToDelete.push({
            title: show.title,
            guid: showGuidList[0] || 'unknown',
            instance: instanceId.toString(),
          })

          if (!dryRun) {
            // Execute the deletion operation
            this.log.debug(
              `Deleting ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" (delete files: ${this.config.deleteFiles})`,
            )
            await service.deleteFromSonarr(show, this.config.deleteFiles)
          } else {
            this.log.debug(
              `[DRY RUN] ${isContinuing ? 'Continuing' : 'Ended'} show "${show.title}" identified for deletion from Sonarr instance ${instanceId}`,
              {
                title: show.title,
                instanceId,
                status: isContinuing ? 'continuing' : 'ended',
                deleteFiles: this.config.deleteFiles,
                guids: showGuidList,
              },
            )
          }

          // Update appropriate counter based on show type
          if (isContinuing) {
            continuingShowsDeleted++
          } else {
            endedShowsDeleted++
          }

          if (!dryRun) {
            this.log.info(
              `Successfully deleted ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" from Sonarr instance ${instanceId}`,
              {
                title: show.title,
                instanceId,
                status: isContinuing ? 'continuing' : 'ended',
                deleteFiles: this.config.deleteFiles,
                guids: showGuidList,
              },
            )
          }
        } catch (error) {
          this.log.error(
            `Error ${dryRun ? 'analyzing' : 'deleting'} show "${show.title}" from instance ${show.sonarr_instance_id}:`,
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

      const tvShowSummary = {
        endedShows: {
          deleted: endedShowsDeleted,
          skipped: endedShowsSkipped,
        },
        continuingShows: {
          deleted: continuingShowsDeleted,
          skipped: continuingShowsSkipped,
        },
        protected: showsProtected,
      }
      this.log.info(
        `TV show tag-based deletion ${dryRun ? 'analysis' : ''} summary: ${endedShowsDeleted + continuingShowsDeleted} identified for deletion (${endedShowsDeleted} ended, ${continuingShowsDeleted} continuing), ${endedShowsSkipped + continuingShowsSkipped} skipped, ${showsProtected} protected by playlist "${this.getProtectionPlaylistName()}"`,
      )
    } else {
      this.log.info('TV show deletion disabled in configuration, skipping')
    }

    // Calculate overall summary statistics
    const totalDeleted =
      moviesDeleted + endedShowsDeleted + continuingShowsDeleted
    const totalSkipped =
      moviesSkipped + endedShowsSkipped + continuingShowsSkipped

    // Calculate total protected items
    const totalProtected = moviesProtected + showsProtected

    const deletionSummary = {
      movies: {
        deleted: moviesDeleted,
        skipped: moviesSkipped,
        protected: moviesProtected,
        items: moviesToDelete,
      },
      shows: {
        deleted: endedShowsDeleted + continuingShowsDeleted,
        skipped: endedShowsSkipped + continuingShowsSkipped,
        protected: showsProtected,
        items: showsToDelete,
      },
      total: {
        deleted: totalDeleted,
        skipped: totalSkipped,
        protected: totalProtected,
        processed: totalDeleted + totalSkipped + totalProtected,
      },
    }

    this.log.info(
      `Tag-based delete sync ${dryRun ? 'analysis' : 'operation'} complete: ${totalDeleted} items identified for deletion, ${totalSkipped} skipped, ${totalProtected} protected, ${totalDeleted + totalSkipped + totalProtected} total processed`,
    )

    // Log detailed summary at debug level
    this.log.debug(
      `Detailed tag-based deletion ${dryRun ? 'analysis' : 'operation'} summary:`,
      {
        ...deletionSummary,
        dryRun,
      },
    )

    // Release cached resources after processing completes
    this.plexServer.clearWorkflowCaches()
    this.protectedGuids = null

    return deletionSummary
  }

  /**
   * Get tags for an instance from cache or fetch them
   *
   * @param instanceId - The instance ID
   * @param service - The media service (Sonarr or Radarr)
   * @returns Promise resolving to a map of tag IDs to lowercase tag labels
   */
  private async getTagsForInstance(
    instanceId: number,
    service: { getTags: () => Promise<Array<{ id: number; label: string }>> },
  ): Promise<Map<number, string>> {
    // Check if we have cached tags for this instance
    const cachedTags = this.tagCache.get(instanceId)
    if (cachedTags) {
      return cachedTags
    }

    try {
      // Fetch tags from the service
      const allTags = await service.getTags()

      // Create a map of tag IDs to lowercase tag labels
      const tagMap = new Map(
        allTags.map((tag) => [tag.id, tag.label.toLowerCase()]),
      )

      // Cache the result
      this.tagCache.set(instanceId, tagMap)

      return tagMap
    } catch (error) {
      this.log.error(`Error fetching tags for instance ${instanceId}:`, error)
      return new Map()
    }
  }

  /**
   * Clear the tag cache (should be called at the start of each sync run)
   */
  private clearTagCache(): void {
    this.tagCache.clear()
  }

  /**
   * Check if an item has the configured removal tag
   *
   * @param instanceId - The instance ID
   * @param service - The media service (Sonarr or Radarr)
   * @param itemTags - The tag IDs on the media item
   * @returns Promise resolving to true if the item has the removal tag
   */
  private async hasRemovalTag(
    instanceId: number,
    service: { getTags: () => Promise<Array<{ id: number; label: string }>> },
    itemTags: number[],
  ): Promise<boolean> {
    if (itemTags.length === 0) {
      return false
    }

    try {
      // Safeguard against missing configuration
      const removalTagPrefix = (this.config.removedTagPrefix ?? '')
        .trim()
        .toLowerCase()
      if (!removalTagPrefix) {
        this.log.warn(
          'removedTagPrefix is blank – tag-based deletion will never match any items',
        )
        return false
      }

      // Get tags from cache or fetch them
      const tagMap = await this.getTagsForInstance(instanceId, service)

      // Check if any of the item's tags match our removal tag (using startsWith for prefix matching)
      for (const tagId of itemTags) {
        const tagLabel = tagMap.get(tagId)
        if (tagLabel?.startsWith(removalTagPrefix)) {
          return true
        }
      }

      return false
    } catch (error) {
      this.log.error('Error checking for removal tag:', error)
      return false
    }
  }

  /**
   * Count series that have the removal tag
   *
   * @param series - Array of all series
   * @returns Promise resolving to count of series with removal tag
   */
  private async countTaggedSeries(series: SonarrItem[]): Promise<number> {
    let count = 0
    let processed = 0

    // Group series by instance for efficient processing
    const seriesByInstance = new Map<number, SonarrItem[]>()

    for (const show of series) {
      if (show.sonarr_instance_id) {
        if (!seriesByInstance.has(show.sonarr_instance_id)) {
          seriesByInstance.set(show.sonarr_instance_id, [])
        }
        seriesByInstance.get(show.sonarr_instance_id)?.push(show)
      }
    }

    // Process each instance
    for (const [instanceId, instanceSeries] of seriesByInstance.entries()) {
      const service = this.sonarrManager.getSonarrService(instanceId)
      if (!service) {
        this.log.warn(
          `Sonarr service for instance ${instanceId} not found, skipping tag count`,
        )
        continue
      }

      // Get all tags for this instance once
      const allTags = await service.getTags()
      const removalTagPrefix = (
        this.config.removedTagPrefix ?? ''
      ).toLowerCase()
      const removedTagIds = allTags
        .filter((tag) => tag.label.toLowerCase().startsWith(removalTagPrefix))
        .map((tag) => tag.id)

      if (removedTagIds.length === 0) {
        // No matching tags in this instance
        processed += instanceSeries.length
        continue
      }

      // Check each series in this instance in batches
      const BATCH_SIZE = 10

      for (let i = 0; i < instanceSeries.length; i += BATCH_SIZE) {
        const batch = instanceSeries.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.all(
          batch.map(async (show) => {
            try {
              const sonarrId = extractSonarrId(show.guids)
              if (sonarrId === 0) {
                return false
              }

              const seriesDetails = await service.getFromSonarr<SonarrSeries>(
                `series/${sonarrId}`,
              )

              return removedTagIds.some((id) =>
                (seriesDetails.tags || []).includes(id),
              )
            } catch (error) {
              this.log.error(
                `Error checking tags for series "${show.title}":`,
                error,
              )
              return false
            }
          }),
        )

        count += batchResults.filter((hasTag) => hasTag).length
        processed += batch.length

        // Log progress periodically
        if (processed % 50 === 0 || processed === series.length) {
          this.log.debug(
            `Checked ${processed}/${series.length} series for removal tag, found ${count} so far`,
          )
        }
      }
    }

    return count
  }

  /**
   * Count movies that have the removal tag
   *
   * @param movies - Array of all movies
   * @returns Promise resolving to count of movies with removal tag
   */
  private async countTaggedMovies(movies: RadarrItem[]): Promise<number> {
    let count = 0
    let processed = 0

    // Group movies by instance for efficient processing
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
      const service = this.radarrManager.getRadarrService(instanceId)
      if (!service) {
        this.log.warn(
          `Radarr service for instance ${instanceId} not found, skipping tag count`,
        )
        continue
      }

      // Get all tags for this instance once
      const allTags = await service.getTags()
      const removalTagPrefix = (
        this.config.removedTagPrefix ?? ''
      ).toLowerCase()
      const removedTagIds = allTags
        .filter((tag) => tag.label.toLowerCase().startsWith(removalTagPrefix))
        .map((tag) => tag.id)

      if (removedTagIds.length === 0) {
        // No matching tags in this instance
        processed += instanceMovies.length
        continue
      }

      // Check each movie in this instance in batches
      const BATCH_SIZE = 10

      for (let i = 0; i < instanceMovies.length; i += BATCH_SIZE) {
        const batch = instanceMovies.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.all(
          batch.map(async (movie) => {
            try {
              const radarrId = extractRadarrId(movie.guids)
              if (radarrId === 0) {
                return false
              }

              const movieDetails = await service.getFromRadarr<RadarrMovie>(
                `movie/${radarrId}`,
              )

              return removedTagIds.some((id) =>
                (movieDetails.tags || []).includes(id),
              )
            } catch (error) {
              this.log.error(
                `Error checking tags for movie "${movie.title}":`,
                error,
              )
              return false
            }
          }),
        )

        count += batchResults.filter((hasTag) => hasTag).length
        processed += batch.length

        // Log progress periodically
        if (processed % 50 === 0 || processed === movies.length) {
          this.log.debug(
            `Checked ${processed}/${movies.length} movies for removal tag, found ${count} so far`,
          )
        }
      }
    }

    return count
  }

  /**
   * Gets the configured protection playlist name or uses the default
   *
   * @returns The protection playlist name to use
   */
  private getProtectionPlaylistName(): string {
    return this.config.plexProtectionPlaylistName || 'Do Not Delete'
  }

  /**
   * Retrieves all watchlist items from the database and extracts their GUIDs
   *
   * This method builds a comprehensive set of GUIDs from all watchlisted content
   * across all users. This set is used to determine what content should be kept.
   *
   * @returns Promise resolving to Set of all GUIDs currently on any watchlist
   */
  private async getAllWatchlistItems(
    respectUserSyncSetting = false,
  ): Promise<Set<string>> {
    try {
      let watchlistItems = []

      if (respectUserSyncSetting) {
        // Get all users to check their sync permissions
        const allUsers = await this.dbService.getAllUsers()
        const syncEnabledUserIds = allUsers
          .filter((user) => user.can_sync !== false)
          .map((user) => user.id)

        this.log.info(
          `Found ${syncEnabledUserIds.length} users with sync enabled out of ${allUsers.length} total users`,
        )

        // Only get watchlist items from users with sync enabled
        const [shows, movies] = await Promise.all([
          this.dbService.getAllShowWatchlistItems().then((items) =>
            items.filter((item) => {
              const userId =
                typeof item.user_id === 'object'
                  ? (item.user_id as { id: number }).id
                  : Number(item.user_id)
              return syncEnabledUserIds.includes(userId)
            }),
          ),
          this.dbService.getAllMovieWatchlistItems().then((items) =>
            items.filter((item) => {
              const userId =
                typeof item.user_id === 'object'
                  ? (item.user_id as { id: number }).id
                  : Number(item.user_id)
              return syncEnabledUserIds.includes(userId)
            }),
          ),
        ])

        watchlistItems = [...shows, ...movies]
        this.log.info(
          `Found ${watchlistItems.length} watchlist items from users with sync enabled`,
        )
      } else {
        // Get all watchlist items regardless of user sync settings
        const [shows, movies] = await Promise.all([
          this.dbService.getAllShowWatchlistItems(),
          this.dbService.getAllMovieWatchlistItems(),
        ])

        watchlistItems = [...shows, ...movies]
        this.log.info(
          `Found ${watchlistItems.length} watchlist items from all users`,
        )
      }

      // Create a set of unique GUIDs and KEYs for efficient lookup
      const guidSet = new Set<string>()
      let malformedItems = 0

      // Process all items to extract GUIDs and KEYs
      for (const item of watchlistItems) {
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

          // Protection system uses standardized GUIDs instead of keys
          // Standardized identifiers enable cross-platform content matching
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

      // Debug sample of collected identifiers (limited to 5)
      if (this.log.level === 'debug' || this.log.level === 'trace') {
        this.log.debug('Sample of watchlist keys (first 5):')
        const sampleKeys = Array.from(guidSet).slice(0, 5)
        for (const item of sampleKeys) {
          this.log.debug(`  Watchlist key: "${item}"`)
        }
      }

      return guidSet
    } catch (error) {
      this.log.error('Error in getAllWatchlistItems:', error)
      throw error
    }
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
    dryRun = false,
  ): Promise<{
    total: {
      deleted: number
      skipped: number
      processed: number
      protected?: number
    }
    movies: {
      deleted: number
      skipped: number
      protected?: number
      items: Array<{ title: string; guid: string; instance: string }>
    }
    shows: {
      deleted: number
      skipped: number
      protected?: number
      items: Array<{ title: string; guid: string; instance: string }>
    }
  }> {
    let moviesDeleted = 0
    let moviesSkipped = 0
    let moviesProtected = 0
    let endedShowsDeleted = 0
    let endedShowsSkipped = 0
    let showsProtected = 0
    let continuingShowsDeleted = 0
    let continuingShowsSkipped = 0

    // Arrays to collect details about what would be deleted
    const moviesToDelete: Array<{
      title: string
      guid: string
      instance: string
    }> = []
    const showsToDelete: Array<{
      title: string
      guid: string
      instance: string
    }> = []

    this.log.info(
      `Beginning deletion ${dryRun ? 'analysis' : 'process'} based on configuration`,
    )

    // Reset workflow caches before processing
    this.plexServer.clearWorkflowCaches()

    // Check if Plex playlist protection is enabled
    if (this.config.enablePlexPlaylistProtection) {
      this.log.info(
        `Plex playlist protection is enabled with playlist name "${this.getProtectionPlaylistName()}"`,
      )

      try {
        // Create protection playlists for users if missing
        const playlistMap =
          await this.plexServer.getOrCreateProtectionPlaylists(true)

        if (playlistMap.size === 0) {
          const errorMsg = `Could not find or create protection playlists "${this.getProtectionPlaylistName()}" for any users - Plex server may be unreachable`
          this.log.error(errorMsg)
          return this.createSafetyTriggeredResult(
            errorMsg,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        try {
          // Populate protected GUIDs cache for lookup operations
          this.protectedGuids = await this.plexServer.getProtectedItems()

          if (!this.protectedGuids) {
            throw new Error('Failed to retrieve protected items')
          }

          this.log.info(
            `Protection playlists "${this.getProtectionPlaylistName()}" for ${playlistMap.size} users contain a total of ${this.protectedGuids.size} protected GUIDs`,
          )

          // Debug sample of protected identifiers (limited to 5)
          if (
            this.protectedGuids.size > 0 &&
            (this.log.level === 'debug' || this.log.level === 'trace')
          ) {
            const sampleGuids = Array.from(this.protectedGuids).slice(0, 5)
            this.log.debug('Sample protected GUIDs:')
            for (const guid of sampleGuids) {
              this.log.debug(`  Protected GUID: "${guid}"`)
            }
          }
        } catch (protectedItemsError) {
          const errorMsg = `Error retrieving protected items from playlists: ${protectedItemsError instanceof Error ? protectedItemsError.message : String(protectedItemsError)}`
          this.log.error(errorMsg)
          return this.createSafetyTriggeredResult(
            errorMsg,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }
      } catch (playlistError) {
        const errorMsg = `Error creating or retrieving protection playlists: ${playlistError instanceof Error ? playlistError.message : String(playlistError)}`
        this.log.error(errorMsg)
        return this.createSafetyTriggeredResult(
          errorMsg,
          dryRun,
          existingSeries.length,
          existingMovies.length,
        )
      }

      // Direct GUID comparison using pre-cached protected GUIDs
      // Efficient approach that avoids individual isItemProtected calls

      this.log.info(
        'Protection uses standardized GUIDs for maximum compatibility across all systems',
      )
    } else {
      this.log.debug('Plex playlist protection is disabled')
    }

    // Process movies if movie deletion is enabled
    if (this.config.deleteMovie) {
      this.log.info(
        `Processing ${existingMovies.length} movies for potential deletion${dryRun ? ' (DRY RUN)' : ''}`,
      )

      for (const movie of existingMovies) {
        // Check if movie exists in any watchlist
        const movieGuidList = parseGuids(movie.guids)
        const exists = movieGuidList.some((guid) => watchlistGuids.has(guid))

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
            // Check if the movie is protected based on its GUIDs
            if (this.config.enablePlexPlaylistProtection) {
              // Double-check if protectedGuids is correctly initialized
              if (!this.protectedGuids) {
                const errorMsg = `Plex playlist protection is enabled but protected GUIDs weren't properly loaded for movie "${movie.title}" - cannot proceed with deletion`
                this.log.error(errorMsg)
                return this.createSafetyTriggeredResult(
                  errorMsg,
                  dryRun,
                  existingSeries.length,
                  existingMovies.length,
                )
              }

              // Check for any movie GUID in the protected set
              let isProtected = false

              for (const guid of movieGuidList) {
                if (this.protectedGuids.has(guid)) {
                  this.log.debug(
                    `Movie "${movie.title}" is protected by GUID "${guid}"`,
                  )
                  isProtected = true
                  break
                }
              }

              if (isProtected) {
                this.log.info(
                  `Skipping deletion of movie "${movie.title}" as it is protected in Plex playlist "${this.getProtectionPlaylistName()}"`,
                )
                moviesProtected++
                continue
              }
            }

            // Get the appropriate Radarr service for this instance
            const service = this.radarrManager.getRadarrService(instanceId)

            if (!service) {
              this.log.warn(
                `Radarr service for instance ${instanceId} not found, skipping deletion of "${movie.title}"`,
              )
              moviesSkipped++
              continue
            }

            // Add to the list of movies to delete (or would delete in dry run)
            moviesToDelete.push({
              title: movie.title,
              guid: movieGuidList[0] || 'unknown',
              instance: instanceId.toString(),
            })

            if (!dryRun) {
              // Actually execute the deletion operation
              this.log.debug(
                `Deleting movie "${movie.title}" (delete files: ${this.config.deleteFiles})`,
              )
              await service.deleteFromRadarr(movie, this.config.deleteFiles)
            } else {
              this.log.debug(
                `[DRY RUN] Movie "${movie.title}" identified for deletion from Radarr instance ${instanceId}`,
                {
                  title: movie.title,
                  instanceId,
                  deleteFiles: this.config.deleteFiles,
                  guids: movieGuidList,
                },
              )
            }

            moviesDeleted++

            if (!dryRun) {
              this.log.info(
                `Successfully deleted movie "${movie.title}" from Radarr instance ${instanceId}`,
                {
                  title: movie.title,
                  instanceId,
                  deleteFiles: this.config.deleteFiles,
                  guids: movieGuidList,
                },
              )
            }
          } catch (error) {
            this.log.error(
              `Error ${dryRun ? 'analyzing' : 'deleting'} movie "${movie.title}" from instance ${movie.radarr_instance_id}:`,
              {
                error: error instanceof Error ? error.message : String(error),
                movie: {
                  title: movie.title,
                  instanceId: movie.radarr_instance_id,
                  guids: movieGuidList,
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
        protected: moviesProtected,
      }
      this.log.info(
        `Movie deletion ${dryRun ? 'analysis' : ''} summary: ${moviesDeleted} identified for deletion, ${moviesSkipped} skipped, ${moviesProtected} protected by playlist "${this.getProtectionPlaylistName()}"`,
      )
    } else {
      this.log.info('Movie deletion disabled in configuration, skipping')
    }

    // Process TV shows if any show deletion is enabled
    if (this.config.deleteEndedShow || this.config.deleteContinuingShow) {
      this.log.info(
        `Processing ${existingSeries.length} TV shows for potential deletion${dryRun ? ' (DRY RUN)' : ''}`,
      )

      for (const show of existingSeries) {
        // Check if show exists in any watchlist
        const showGuidList = parseGuids(show.guids)
        const exists = showGuidList.some((guid) => watchlistGuids.has(guid))

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
            // Check if the show is protected based on its GUIDs
            if (this.config.enablePlexPlaylistProtection) {
              // Double-check if protectedGuids is correctly initialized
              if (!this.protectedGuids) {
                const errorMsg = `Plex playlist protection is enabled but protected GUIDs weren't properly loaded for show "${show.title}" - cannot proceed with deletion`
                this.log.error(errorMsg)
                return this.createSafetyTriggeredResult(
                  errorMsg,
                  dryRun,
                  existingSeries.length,
                  existingMovies.length,
                )
              }

              // Check for any show GUID in the protected set
              let isProtected = false

              for (const guid of showGuidList) {
                if (this.protectedGuids.has(guid)) {
                  this.log.debug(
                    `Show "${show.title}" is protected by GUID "${guid}"`,
                  )
                  isProtected = true
                  break
                }
              }

              if (isProtected) {
                this.log.info(
                  `Skipping deletion of ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" as it is protected in Plex playlist "${this.getProtectionPlaylistName()}"`,
                )
                showsProtected++
                continue
              }
            }

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

            // Add to the list of shows to delete (or would delete in dry run)
            showsToDelete.push({
              title: show.title,
              guid: showGuidList[0] || 'unknown',
              instance: instanceId.toString(),
            })

            if (!dryRun) {
              // Execute the deletion operation
              this.log.debug(
                `Deleting ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" (delete files: ${this.config.deleteFiles})`,
              )
              await service.deleteFromSonarr(show, this.config.deleteFiles)
            } else {
              this.log.debug(
                `[DRY RUN] ${isContinuing ? 'Continuing' : 'Ended'} show "${show.title}" identified for deletion from Sonarr instance ${instanceId}`,
                {
                  title: show.title,
                  instanceId,
                  status: isContinuing ? 'continuing' : 'ended',
                  deleteFiles: this.config.deleteFiles,
                  guids: showGuidList,
                },
              )
            }

            // Update appropriate counter based on show type
            if (isContinuing) {
              continuingShowsDeleted++
            } else {
              endedShowsDeleted++
            }

            if (!dryRun) {
              this.log.info(
                `Successfully deleted ${isContinuing ? 'continuing' : 'ended'} show "${show.title}" from Sonarr instance ${instanceId}`,
                {
                  title: show.title,
                  instanceId,
                  status: isContinuing ? 'continuing' : 'ended',
                  deleteFiles: this.config.deleteFiles,
                  guids: showGuidList,
                },
              )
            }
          } catch (error) {
            this.log.error(
              `Error ${dryRun ? 'analyzing' : 'deleting'} show "${show.title}" from instance ${show.sonarr_instance_id}:`,
              {
                error: error instanceof Error ? error.message : String(error),
                show: {
                  title: show.title,
                  instanceId: show.sonarr_instance_id,
                  status: isContinuing ? 'continuing' : 'ended',
                  guids: showGuidList,
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
        protected: showsProtected,
      }
      this.log.info(
        `TV show deletion ${dryRun ? 'analysis' : ''} summary: ${endedShowsDeleted + continuingShowsDeleted} identified for deletion (${endedShowsDeleted} ended, ${continuingShowsDeleted} continuing), ${endedShowsSkipped + continuingShowsSkipped} skipped, ${showsProtected} protected by playlist "${this.getProtectionPlaylistName()}"`,
      )
    } else {
      this.log.info('TV show deletion disabled in configuration, skipping')
    }

    // Calculate overall summary statistics
    const totalDeleted =
      moviesDeleted + endedShowsDeleted + continuingShowsDeleted
    const totalSkipped =
      moviesSkipped + endedShowsSkipped + continuingShowsSkipped

    // Calculate total protected items
    const totalProtected = moviesProtected + showsProtected

    const deletionSummary = {
      movies: {
        deleted: moviesDeleted,
        skipped: moviesSkipped,
        protected: moviesProtected,
        items: moviesToDelete,
      },
      shows: {
        deleted: endedShowsDeleted + continuingShowsDeleted,
        skipped: endedShowsSkipped + continuingShowsSkipped,
        protected: showsProtected,
        items: showsToDelete,
      },
      total: {
        deleted: totalDeleted,
        skipped: totalSkipped,
        protected: totalProtected,
        processed: totalDeleted + totalSkipped + totalProtected,
      },
    }

    this.log.info(
      `Delete sync ${dryRun ? 'analysis' : 'operation'} complete: ${totalDeleted} items identified for deletion, ${totalSkipped} skipped, ${totalProtected} protected, ${totalDeleted + totalSkipped + totalProtected} total processed`,
    )

    // Log detailed summary at debug level
    this.log.debug(
      `Detailed deletion ${dryRun ? 'analysis' : 'operation'} summary:`,
      {
        ...deletionSummary,
        dryRun,
      },
    )

    // Release cached resources after processing completes
    this.plexServer.clearWorkflowCaches()
    this.protectedGuids = null

    return deletionSummary
  }
}
