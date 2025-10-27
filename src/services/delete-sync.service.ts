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

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import {
  ensureProtectionCache,
  ensureTrackedCache,
  isAnyGuidTracked,
  TagCache,
} from '@services/delete-sync/cache/index.js'
import {
  executeTagBasedDeletion,
  executeWatchlistDeletion,
} from '@services/delete-sync/orchestration/index.js'
import {
  createEmptyResult,
  createSafetyTriggeredResult,
} from '@services/delete-sync/result-builder.js'
import { parseGuids } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class DeleteSyncService {
  /**
   * Cache of protected GUIDs for efficient lookup
   */
  private protectedGuids: Set<string> | null = null

  /**
   * Cache of tracked content GUIDs (from approval_requests) for efficient lookup
   */
  private trackedGuids: Set<string> | null = null

  /**
   * Cache of tags by instance for efficient lookup during tag-based deletion
   * Key format: "{instanceType}-{instanceId}" to avoid collisions between Sonarr and Radarr
   */
  private tagCache: TagCache = new TagCache()

  /**
   * Flag to prevent concurrent runs of the delete sync process
   */
  private _running = false

  /**
   * Track deleted content by type for approval cleanup
   */
  private deletedMovieGuids: Set<string> = new Set()
  private deletedShowGuids: Set<string> = new Set()

  /**
   * Creates a new DeleteSyncService instance
   *
   * @param log - Fastify logger instance for recording operations
   * @param fastify - Fastify instance for accessing other services and configuration
   */
  /** Creates a fresh service logger that inherits current log level */

  private get log(): FastifyBaseLogger {
    return createServiceLogger(this.baseLog, 'DELETE_SYNC')
  }

  constructor(
    private readonly baseLog: FastifyBaseLogger,
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
   * Ensures tracked content cache is loaded once per workflow
   * Loads GUIDs from approval_requests table for tracked-only deletion
   */
  private async ensureTrackedCache(): Promise<Set<string> | null> {
    this.trackedGuids = await ensureTrackedCache(
      this.trackedGuids,
      this.config.deleteSyncTrackedOnly,
      this.dbService,
      this.log,
    )
    return this.trackedGuids
  }

  /**
   * Ensures protection cache is loaded once per workflow
   * Avoids redundant API calls for protection playlist loading
   */
  private async ensureProtectionCache(): Promise<Set<string> | null> {
    this.protectedGuids = await ensureProtectionCache(
      this.protectedGuids,
      this.config.enablePlexPlaylistProtection,
      this.fastify,
      this.getProtectionPlaylistName(),
      this.log,
    )
    return this.protectedGuids
  }

  /**
   * Returns true if any of the provided GUIDs exist in the protected set.
   * Optional onHit callback lets callers log the first matching GUID.
   */
  /**
   * Returns true if any of the provided GUIDs exist in the tracked set.
   * When deleteSyncTrackedOnly is enabled, only tracked content can be deleted.
   * Optional onHit callback lets callers log the first matching GUID.
   */
  private isAnyGuidTracked(
    guidList: string[],
    onHit?: (guid: string) => void,
  ): boolean {
    return isAnyGuidTracked(
      guidList,
      this.trackedGuids,
      this.config.deleteSyncTrackedOnly,
      onHit,
    )
  }

  /**
   * Initialize the service and its dependencies
   */
  async initialize(): Promise<boolean> {
    try {
      // Initialize Plex server service
      const initialized = await this.fastify.plexServerService.initialize()
      if (!initialized) {
        this.log.error('Failed to initialize Plex server service')
        return false
      }

      this.log.info('Delete Sync Service initialized successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Error initializing Delete Sync Service:')
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
  async run(dryRun = false): Promise<DeleteSyncResult> {
    // Check if delete sync is already running
    if (this._running) {
      this.log.warn(
        'Delete-sync already in progress – ignoring duplicate trigger',
      )
      return this.handleEmptyResult('Duplicate delete-sync run skipped')
    }

    this._running = true
    try {
      const deletionMode = this.getDeletionMode()
      this.log.info(
        `Starting delete sync operation in ${deletionMode} mode${dryRun ? ' (DRY RUN)' : ''}`,
      )

      // Clear tag cache at the start of each run
      this.clearTagCache()
      // Reset per-run caches to ensure fresh data every run
      this.protectedGuids = null
      this.trackedGuids = null
      this.deletedMovieGuids.clear()
      this.deletedShowGuids.clear()
      this.fastify.plexServerService.clearWorkflowCaches()

      // Make sure the Plex server is initialized if needed
      if (
        this.config.enablePlexPlaylistProtection &&
        !this.fastify.plexServerService.isInitialized()
      ) {
        this.log.info(
          'Plex playlist protection enabled but not initialized - initializing now',
        )
        const ok = await this.initialize()
        if (!ok) {
          return this.handleSafetyTriggered(
            'Plex playlist protection is enabled but the Plex server failed to initialize',
            dryRun,
          )
        }
      }

      // Step 1: Skip if deletion features are not enabled in configuration
      if (!this.isDeleteEnabled()) {
        return this.handleEmptyResult(
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
          return this.handleSafetyTriggered(
            refreshResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        await this.updateUserTags(existingSeries, existingMovies)
      }

      let result: DeleteSyncResult

      // Branch based on deletion mode
      if (deletionMode === 'tag-based') {
        // Tag-based deletion workflow
        this.log.debug(
          `Running tag-based deletion using tag "${this.config.removedTagPrefix}"`,
        )

        // Process tag-based delete sync workflow
        result = await this.processTagBasedDeleteSync(
          existingSeries,
          existingMovies,
          dryRun,
        )
      } else {
        // Watchlist-based delete sync workflow

        // Step 4: Refresh watchlists to ensure current data
        const refreshResult = await this.refreshWatchlists()
        if (!refreshResult.success) {
          return this.handleSafetyTriggered(
            refreshResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        // Step 5: Get all watchlisted content GUIDs
        const allWatchlistItems = await this.getAllWatchlistItems(
          this.config.respectUserSyncSetting,
        )

        // Step 6: Ensure we have at least some watchlist items (safety check)
        if (allWatchlistItems.size === 0) {
          return this.handleSafetyTriggered(
            'No watchlist items found - this could be an error condition. Aborting delete sync to prevent mass deletion.',
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        this.log.info(
          `Found ${allWatchlistItems.size} unique GUIDs across all watchlists${this.config.respectUserSyncSetting ? ' (respecting user sync settings)' : ''}`,
        )

        // Step 7: Load tracked content GUIDs if tracked-only deletion is enabled
        if (this.config.deleteSyncTrackedOnly) {
          this.log.info(
            'Tracked-only deletion is enabled - only content from approval system will be deleted',
          )

          try {
            const trackedGuids = await this.ensureTrackedCache()

            if (!trackedGuids) {
              throw new Error('Failed to retrieve tracked content GUIDs')
            }

            this.log.info(
              `Found ${trackedGuids.size} tracked content GUIDs in approval system`,
            )
          } catch (trackedError) {
            const errorMsg = `Error retrieving tracked content GUIDs: ${trackedError instanceof Error ? trackedError.message : String(trackedError)}`
            this.log.error(
              {
                error:
                  trackedError instanceof Error
                    ? trackedError
                    : new Error(String(trackedError)),
              },
              errorMsg,
            )
            return this.handleSafetyTriggered(
              errorMsg,
              dryRun,
              existingSeries.length,
              existingMovies.length,
            )
          }
        }

        // Step 8: Load protection playlists if enabled (needed for accurate safety check)
        let protectedGuids: Set<string> | null = null
        if (this.config.enablePlexPlaylistProtection) {
          if (!this.fastify.plexServerService.isInitialized()) {
            return this.handleSafetyTriggered(
              'Plex playlist protection is enabled but Plex server is not properly initialized - cannot proceed with deletion to ensure content safety',
              dryRun,
              existingSeries.length,
              existingMovies.length,
            )
          }

          try {
            this.log.info(
              `Beginning deletion analysis; Plex playlist protection enabled with playlist "${this.getProtectionPlaylistName()}"`,
            )

            // Use cached protection loading to avoid redundant API calls
            protectedGuids = await this.ensureProtectionCache()

            if (!protectedGuids) {
              throw new Error('Failed to retrieve protected items')
            }

            this.log.info(
              `Protection playlists "${this.getProtectionPlaylistName()}" contain a total of ${protectedGuids.size} protected GUIDs`,
            )
            this.log.info(
              'Protection uses standardized GUIDs for maximum compatibility across all systems',
            )
          } catch (protectedItemsError) {
            const errorMsg = `Error retrieving protected items from playlists: ${protectedItemsError instanceof Error ? protectedItemsError.message : String(protectedItemsError)}`
            this.log.error(
              {
                error:
                  protectedItemsError instanceof Error
                    ? protectedItemsError
                    : new Error(String(protectedItemsError)),
              },
              errorMsg,
            )
            return this.handleSafetyTriggered(
              errorMsg,
              dryRun,
              existingSeries.length,
              existingMovies.length,
            )
          }
        }

        // Step 8: Perform safety check for mass deletion prevention (with protection awareness)
        const safetyResult = this.performSafetyCheck(
          existingSeries,
          existingMovies,
          allWatchlistItems,
          protectedGuids,
        )

        if (!safetyResult.safe) {
          return this.handleSafetyTriggered(
            safetyResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        // Step 9: If everything is safe, proceed with the actual watchlist-based processing
        // Protection cache is already set by ensureProtectionCache()
        result = await this.processDeleteSync(
          existingSeries,
          existingMovies,
          allWatchlistItems,
          dryRun,
        )
      }

      this.log.info(
        `Delete sync operation${dryRun ? ' (DRY RUN)' : ''} completed successfully`,
      )

      // Step 10: Clean up approval requests for deleted content if enabled
      if (this.config.deleteSyncCleanupApprovals && !dryRun) {
        try {
          let totalCleaned = 0

          // Clean up movie approval requests
          if (this.deletedMovieGuids.size > 0) {
            this.log.info(
              `Cleaning up movie approval requests for content with ${this.deletedMovieGuids.size} deleted GUIDs`,
            )
            const movieApprovals =
              await this.dbService.getApprovalRequestsByGuids(
                this.deletedMovieGuids,
                'movie',
              )

            // Use ApprovalService to delete each request (handles SSE events)
            for (const approval of movieApprovals) {
              try {
                await this.fastify.approvalService.deleteApprovalRequest(
                  approval.id,
                )
                totalCleaned++
              } catch (error) {
                this.log.error(
                  {
                    error,
                    approvalId: approval.id,
                    title: approval.contentTitle,
                  },
                  'Error deleting individual approval request during cleanup',
                )
              }
            }

            this.log.info(
              `Cleaned up ${movieApprovals.length} movie approval records`,
            )
          }

          // Clean up show approval requests
          if (this.deletedShowGuids.size > 0) {
            this.log.info(
              `Cleaning up show approval requests for content with ${this.deletedShowGuids.size} deleted GUIDs`,
            )
            const showApprovals =
              await this.dbService.getApprovalRequestsByGuids(
                this.deletedShowGuids,
                'show',
              )

            // Use ApprovalService to delete each request (handles SSE events)
            for (const approval of showApprovals) {
              try {
                await this.fastify.approvalService.deleteApprovalRequest(
                  approval.id,
                )
                totalCleaned++
              } catch (error) {
                this.log.error(
                  {
                    error,
                    approvalId: approval.id,
                    title: approval.contentTitle,
                  },
                  'Error deleting individual approval request during cleanup',
                )
              }
            }

            this.log.info(
              `Cleaned up ${showApprovals.length} show approval records`,
            )
          }

          if (totalCleaned > 0) {
            this.log.info(`Total approval requests cleaned up: ${totalCleaned}`)
          }
        } catch (cleanupError) {
          this.log.error(
            { error: cleanupError },
            'Error cleaning up approval requests for deleted content',
          )
        }
      }

      // Step 11: Send notifications about results if enabled
      await this.sendNotificationsIfEnabled(result, dryRun)

      return result
    } catch (error) {
      this.logError('Error in delete sync operation:', error)
      throw error
    } finally {
      this._running = false
      // Always reset caches, even if we exited early
      this.fastify.plexServerService.clearWorkflowCaches()
      this.protectedGuids = null
      this.trackedGuids = null
      this.deletedMovieGuids.clear()
      this.deletedShowGuids.clear()
      this.clearTagCache()
    }
  }

  /**
   * Creates an empty result object when deletion is skipped
   */
  private handleEmptyResult(logMessage: string): DeleteSyncResult {
    this.log.info(logMessage)
    return createEmptyResult(logMessage)
  }

  /**
   * Creates a result object for when safety was triggered
   */
  private handleSafetyTriggered(
    message: string,
    dryRun: boolean,
    seriesCount = 0,
    moviesCount = 0,
  ): DeleteSyncResult {
    this.log.error(message)
    this.log.error('Delete operation aborted to prevent mass deletion.')

    const result = createSafetyTriggeredResult(
      message,
      seriesCount,
      moviesCount,
    )

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
    this.log.debug(
      {
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
      },
      'Delete configuration',
    )
  }

  /**
   * Refreshes all watchlists to ensure current data with retry logic
   */
  private async refreshWatchlists(): Promise<{
    success: boolean
    message: string
  }> {
    const maxRetries = 2
    const baseDelay = 1000 // 1 second

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.log.info(
            `Refreshing watchlists attempt ${attempt + 1}/${maxRetries + 1}`,
          )
        } else {
          this.log.debug('Refreshing watchlists to ensure we have current data')
        }

        await Promise.all([
          this.fastify.plexWatchlist.getSelfWatchlist(),
          this.fastify.plexWatchlist.getOthersWatchlists(),
        ])

        this.log.debug('Watchlists refreshed successfully')
        return { success: true, message: 'Watchlists refreshed successfully' }
      } catch (refreshError) {
        const isLastAttempt = attempt === maxRetries
        const errorMessage = `Failed to refresh watchlist data: ${
          refreshError instanceof Error
            ? refreshError.message
            : String(refreshError)
        }`

        if (isLastAttempt) {
          this.log.error(
            { error: refreshError, attempts: attempt + 1 },
            'Error refreshing watchlist data after all retry attempts',
          )
          return { success: false, message: errorMessage }
        } else {
          const delay = baseDelay * 2 ** attempt // Exponential backoff
          this.log.warn(
            { error: refreshError, attempt: attempt + 1, retryIn: delay },
            `Watchlist refresh failed, retrying in ${delay}ms`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    return { success: false, message: 'Unexpected error in retry logic' }
  }

  /**
   * Fetches all content from media management servers
   */
  private async fetchAllMediaContent(): Promise<{
    existingSeries: SonarrItem[]
    existingMovies: RadarrItem[]
  }> {
    this.log.debug('Retrieving all content from Sonarr and Radarr instances')
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
    protectedGuids: Set<string> | null = null,
  ): { safe: boolean; message: string } {
    // Calculate deletion percentages by doing a count of items that would be deleted
    let potentialMovieDeletes = 0
    let potentialShowDeletes = 0
    const considerMovies = this.config.deleteMovie === true
    const considerEnded = this.config.deleteEndedShow === true
    const considerContinuing = this.config.deleteContinuingShow === true
    let totalConsideredItems = 0

    // Use Set membership directly for O(1) lookups
    const watchlistGuidsSet = allWatchlistItems
    const protectedGuidsSet = protectedGuids ?? null

    // Count movies not in watchlist and not protected (only if we actually delete movies)
    if (considerMovies) {
      for (const movie of existingMovies) {
        totalConsideredItems++
        const movieGuidList = parseGuids(movie.guids)
        const existsInWatchlist = movieGuidList.some((g) =>
          watchlistGuidsSet.has(g),
        )
        if (!existsInWatchlist) {
          // Check if movie is tracked (if tracked-only deletion is enabled)
          const isTracked = this.isAnyGuidTracked(movieGuidList)
          if (!isTracked) {
            continue // Skip non-tracked items when tracked-only is enabled
          }

          // Check if movie is protected by playlist
          const isProtected =
            protectedGuidsSet != null
              ? movieGuidList.some((g) => protectedGuidsSet.has(g))
              : false
          if (!isProtected) {
            potentialMovieDeletes++
          }
        }
      }
    }

    // Count shows not in watchlist and not protected, but only for show types configured for deletion
    for (const show of existingSeries) {
      const isContinuing = show.series_status !== 'ended'
      const shouldConsider = isContinuing ? considerContinuing : considerEnded
      if (!shouldConsider) continue
      totalConsideredItems++

      const showGuidList = parseGuids(show.guids)
      const existsInWatchlist = showGuidList.some((g) =>
        watchlistGuidsSet.has(g),
      )
      if (!existsInWatchlist) {
        // Check if show is tracked (if tracked-only deletion is enabled)
        const isTracked = this.isAnyGuidTracked(showGuidList)
        if (!isTracked) {
          continue // Skip non-tracked items when tracked-only is enabled
        }

        // Check if show is protected by playlist
        const isProtected =
          protectedGuidsSet != null
            ? showGuidList.some((g) => protectedGuidsSet.has(g))
            : false
        if (!isProtected) {
          potentialShowDeletes++
        }
      }
    }

    const totalPotentialDeletes = potentialMovieDeletes + potentialShowDeletes
    const potentialDeletionPercentage =
      totalConsideredItems > 0
        ? (totalPotentialDeletes / totalConsideredItems) * 100
        : 0

    // Prevent mass deletion if percentage is too high
    const MAX_DELETION_PERCENTAGE = Number(
      this.config.maxDeletionPrevention ?? 10,
    ) // Default to 10% as configured in the database

    if (
      Number.isNaN(MAX_DELETION_PERCENTAGE) ||
      MAX_DELETION_PERCENTAGE < 0 ||
      MAX_DELETION_PERCENTAGE > 100
    ) {
      // Debug breadcrumbs for config validation failures
      this.log.debug({
        rawMaxDeletionPrevention: this.config.maxDeletionPrevention,
        parsed: MAX_DELETION_PERCENTAGE,
        type: typeof this.config.maxDeletionPrevention,
      })
      return {
        safe: false,
        message: `Invalid maxDeletionPrevention value: "${this.config.maxDeletionPrevention}". Please set a percentage between 0 and 100 inclusive.`,
      }
    }

    if (potentialDeletionPercentage > MAX_DELETION_PERCENTAGE) {
      return {
        safe: false,
        message: `Safety check failed: Would delete ${totalPotentialDeletes} out of ${totalConsideredItems} eligible items (${potentialDeletionPercentage.toFixed(2)}%), which exceeds maximum allowed percentage of ${MAX_DELETION_PERCENTAGE}%.`,
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
      // Modern values
      'all',
      'discord-only',
      'discord-webhook',
      'discord-message',
      'discord-both',
      'webhook-only',
      'dm-only',
      // Legacy values (back-compat)
      'message',
      'webhook',
      'both',
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
          {
            error:
              notifyError instanceof Error
                ? notifyError
                : new Error(String(notifyError)),
          },
          'Error sending delete sync Discord notification:',
        )
      }
    }

    // Apprise notification logic
    if (sendApprise && this.fastify.apprise?.isEnabled()) {
      try {
        await this.fastify.apprise?.sendDeleteSyncNotification(result, dryRun)
      } catch (notifyError) {
        this.log.error(
          {
            error:
              notifyError instanceof Error
                ? notifyError
                : new Error(String(notifyError)),
          },
          'Error sending delete sync Apprise notification:',
        )
      }
    }
  }

  /**
   * Helper method to log errors with consistent format
   */
  private logError(message: string, error: unknown): void {
    const errObj = error instanceof Error ? error : new Error(String(error))
    this.log.error({ error: errObj }, message)
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
    this.log.debug('Updating user tags before delete sync')

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

      this.log.debug('User tags updated successfully')
    } catch (error) {
      this.log.error({ error }, 'Error updating user tags:')
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
    // Load tracked cache if tracked-only deletion is enabled (MUST be done before orchestration)
    if (this.config.deleteSyncTrackedOnly) {
      await this.ensureTrackedCache()
    }

    // Load protection cache if enabled (MUST be done before orchestration)
    if (this.config.enablePlexPlaylistProtection) {
      await this.ensureProtectionCache()
    }

    return executeTagBasedDeletion(
      existingSeries,
      existingMovies,
      {
        config: {
          removedTagPrefix: this.config.removedTagPrefix,
          deleteSyncTrackedOnly: this.config.deleteSyncTrackedOnly,
          enablePlexPlaylistProtection:
            this.config.enablePlexPlaylistProtection,
          deleteMovie: this.config.deleteMovie,
          deleteEndedShow: this.config.deleteEndedShow,
          deleteContinuingShow: this.config.deleteContinuingShow,
          deleteFiles: this.config.deleteFiles,
          maxDeletionPrevention: this.config.maxDeletionPrevention ?? 10,
          deleteSyncRequiredTagRegex: this.config.deleteSyncRequiredTagRegex,
        },
        sonarrManager: this.sonarrManager,
        radarrManager: this.radarrManager,
        tagCache: this.tagCache,
        protectedGuids: this.protectedGuids,
        trackedGuids: this.trackedGuids,
        deletedMovieGuids: this.deletedMovieGuids,
        deletedShowGuids: this.deletedShowGuids,
        logger: this.log,
        protectionPlaylistName: this.getProtectionPlaylistName(),
        setProtectedGuids: (guids) => {
          this.protectedGuids = guids
        },
        setTrackedGuids: (guids) => {
          this.trackedGuids = guids
        },
      },
      dryRun,
    )
  }

  /**
   * Clear the tag cache (should be called at the start of each sync run)
   */
  private clearTagCache(): void {
    this.tagCache.clear()
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
      let watchlistItems: Array<{ title: string; guids?: string | string[] }> =
        []

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

      // Create a set of unique GUIDs for efficient lookup
      const guidSet = new Set<string>()
      let malformedItems = 0

      // Process all items to extract GUIDs using the standardized GUID handler
      for (const item of watchlistItems) {
        try {
          // Use parseGuids utility for consistent GUID parsing and normalization
          const parsedGuids = parseGuids(item.guids)

          // Add each parsed and normalized GUID to the set for efficient lookup
          for (const guid of parsedGuids) {
            guidSet.add(guid)
          }

          // Protection system uses standardized GUIDs instead of keys
          // Standardized identifiers enable cross-platform content matching
        } catch (error) {
          malformedItems++
          this.log.warn(
            {
              error: error instanceof Error ? error : new Error(String(error)),
              guids: item.guids,
            },
            `Malformed guids in watchlist item "${item.title}"`,
          )
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

      // Trace sample of collected identifiers (limited to 5)
      if (this.log.level === 'trace') {
        const sampleGuids = Array.from(guidSet).slice(0, 5)
        this.log.trace({ sampleGuids }, 'Sample of watchlist GUIDs (first 5)')
      }

      return guidSet
    } catch (error) {
      this.log.error({ error }, 'Error in getAllWatchlistItems:')
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
  ): Promise<DeleteSyncResult> {
    return executeWatchlistDeletion(
      existingSeries,
      existingMovies,
      watchlistGuids,
      {
        config: {
          deleteMovie: this.config.deleteMovie,
          deleteEndedShow: this.config.deleteEndedShow,
          deleteContinuingShow: this.config.deleteContinuingShow,
          deleteFiles: this.config.deleteFiles,
          deleteSyncTrackedOnly: this.config.deleteSyncTrackedOnly,
          enablePlexPlaylistProtection:
            this.config.enablePlexPlaylistProtection,
        },
        sonarrManager: this.sonarrManager,
        radarrManager: this.radarrManager,
        tagCache: this.tagCache,
        protectedGuids: this.protectedGuids,
        trackedGuids: this.trackedGuids,
        deletedMovieGuids: this.deletedMovieGuids,
        deletedShowGuids: this.deletedShowGuids,
        logger: this.log,
        protectionPlaylistName: this.getProtectionPlaylistName(),
      },
      dryRun,
    )
  }
}
