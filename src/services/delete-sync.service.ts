import {
  MAX_DELETION_PREVENTION,
  PLEX_PROTECTION_PLAYLIST_DEFAULT,
} from '@root/schemas/shared/delete-sync-limits.js'
import type {
  DeleteSyncDryRunOutcome,
  DeleteSyncResult,
} from '@root/types/delete-sync.types.js'
import type { ProgressEvent } from '@root/types/progress.types.js'
import type { Item as RadarrItem } from '@root/types/radarr.types.js'
import type { Item as SonarrItem } from '@root/types/sonarr.types.js'
import { ensureProtectionCache } from '@services/delete-sync/cache/protected-cache.js'
import { TagCache } from '@services/delete-sync/cache/tag-cache.js'
import { ensureTrackedCache } from '@services/delete-sync/cache/tracked-cache.js'
import {
  cleanupApprovalRequestsForDeletedContent,
  cleanupOrphanedApprovalRequests,
} from '@services/delete-sync/cleanup/approval-cleanup.js'
import { cleanupRollingMonitoredShowsForDeletedContent } from '@services/delete-sync/cleanup/rolling-monitor-cleanup.js'
import {
  extractGuidsFromWatchlistItems,
  fetchWatchlistItems,
  filterExcludedRoutedItems,
} from '@services/delete-sync/data-fetching/watchlist-fetcher.js'
import { executeTagBasedDeletion } from '@services/delete-sync/orchestration/tag-based-deletion.js'
import { executeWatchlistDeletion } from '@services/delete-sync/orchestration/watchlist-deletion.js'
import {
  createDryRunOutcome,
  createEmptyResult,
  createSafetyTriggeredResult,
} from '@services/delete-sync/utils/result-builder.js'
import { performWatchlistSafetyCheck } from '@services/delete-sync/validation/safety-checker.js'
import type { TaggingResults } from '@services/user-tags/types.js'
import { errorMessage, toError } from '@utils/error-message.js'
import { createGuidSet } from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { createRunRecord } from '@utils/run-record.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class DeleteSyncService {
  private protectedGuids: Set<string> | null = null

  private trackedGuids: Set<string> | null = null

  private tagCache: TagCache = new TagCache()

  private _running = false

  private readonly dryRun = createRunRecord<DeleteSyncDryRunOutcome>()

  private deletedMovieGuids: Set<string> = new Set()
  private deletedShowGuids: Set<string> = new Set()

  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'DELETE_SYNC')
    this.log.debug('Initializing Delete Sync Service')
  }

  private get config() {
    return this.fastify.config
  }

  private get dbService() {
    return this.fastify.db
  }

  private get sonarrManager() {
    return this.fastify.sonarrManager
  }

  private get radarrManager() {
    return this.fastify.radarrManager
  }

  private async ensureTrackedCache(): Promise<Set<string> | null> {
    this.trackedGuids = await ensureTrackedCache(
      this.trackedGuids,
      this.config.deleteSyncTrackedOnly,
      this.dbService,
      this.log,
    )
    return this.trackedGuids
  }

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

  async initialize(): Promise<boolean> {
    try {
      const initialized = await this.fastify.plexServerService.initialize()
      if (!initialized) {
        this.log.error('Failed to initialize Plex server service')
        return false
      }

      this.log.debug('Delete Sync Service initialized successfully')
      return true
    } catch (error) {
      this.log.error({ error }, 'Error initializing Delete Sync Service:')
      return false
    }
  }

  /** Starts a dry run without waiting for it, false while any delete sync runs. */
  startDryRun(): boolean {
    if (this._running) return false
    this.dryRun.begin()
    this.emitDryRunPhase('running')
    this.runDryRun().then(
      (outcome) => {
        this.dryRun.succeed(outcome)
        this.emitDryRunPhase('complete')
      },
      (error) => {
        this.dryRun.fail(error)
        this.emitDryRunPhase('failed')
      },
    )
    return true
  }

  async runDryRun(): Promise<DeleteSyncDryRunOutcome> {
    return createDryRunOutcome(await this.run(true))
  }

  dryRunStatus() {
    return this.dryRun.read()
  }

  private emitDryRunPhase(phase: 'running' | 'complete' | 'failed'): void {
    if (!this.fastify.progress.hasActiveConnections()) return
    const event: ProgressEvent = {
      operationId: 'delete-sync-dry-run',
      type: 'delete-sync-dry-run',
      phase,
      progress: phase === 'running' ? 0 : 100,
      message: `Delete sync dry run ${phase}`,
    }
    this.fastify.progress.emit(event)
  }

  /** Resolves to a skipped result instead of starting while another run is in progress. */
  async run(dryRun = false): Promise<DeleteSyncResult> {
    if (this._running) {
      this.log.warn(
        'Delete-sync already in progress, ignoring duplicate trigger',
      )
      return this.handleEmptyResult('Duplicate delete-sync run skipped')
    }

    this._running = true
    try {
      const deletionMode = this.getDeletionMode()
      this.log.info(
        `Starting delete sync operation in ${deletionMode} mode${dryRun ? ' (DRY RUN)' : ''}`,
      )

      this.clearTagCache()
      this.protectedGuids = null
      this.trackedGuids = null
      this.deletedMovieGuids.clear()
      this.deletedShowGuids.clear()
      this.fastify.plexServerService.clearWorkflowCaches()

      if (
        this.config.enablePlexPlaylistProtection &&
        !this.fastify.plexServerService.isInitialized()
      ) {
        this.log.debug(
          'Plex playlist protection enabled but not initialized, initializing now',
        )
        const ok = await this.initialize()
        if (!ok) {
          return this.handleSafetyTriggered(
            'Plex playlist protection is enabled but the Plex server failed to initialize',
            dryRun,
          )
        }
      }

      if (!this.isDeleteEnabled()) {
        return this.handleEmptyResult(
          'Delete sync is not enabled in configuration, skipping operation',
        )
      }

      this.logDeleteConfiguration(dryRun)

      let { existingSeries, existingMovies } = await this.fetchAllMediaContent()

      let result: DeleteSyncResult

      if (deletionMode === 'tag-based') {
        const refreshResult = await this.refreshWatchlists()
        if (!refreshResult.success) {
          return this.handleSafetyTriggered(
            refreshResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        const tagResult = await this.updateUserTags(
          existingSeries,
          existingMovies,
        )
        if (!tagResult.success) {
          return this.handleSafetyTriggered(
            tagResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }
        if (tagResult.tagged) {
          // Tagging rewrites removal tags in the arrs, so deletion reads a fresh snapshot
          const fresh = await this.fetchAllMediaContent()
          existingSeries = fresh.existingSeries
          existingMovies = fresh.existingMovies
        }

        this.log.debug(
          `Running tag-based deletion using tag "${this.config.removedTagPrefix}"`,
        )

        result = await this.processTagBasedDeleteSync(
          existingSeries,
          existingMovies,
          dryRun,
        )
        if (result.safetyTriggered) {
          return result
        }
      } else {
        const refreshResult = await this.refreshWatchlists()
        if (!refreshResult.success) {
          return this.handleSafetyTriggered(
            refreshResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        const allWatchlistItems = await this.getWatchlistGuids(
          this.config.respectUserSyncSetting,
        )

        if (allWatchlistItems.size === 0) {
          return this.handleSafetyTriggered(
            'No watchlist items found, which could be an error condition. Aborting delete sync to prevent mass deletion.',
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        this.log.debug(
          `Found ${allWatchlistItems.size} unique GUIDs across all watchlists${this.config.respectUserSyncSetting ? ' (respecting user sync settings)' : ''}`,
        )

        const trackedLoadResult = await this.loadTrackedCacheIfEnabled(
          existingSeries.length,
          existingMovies.length,
          dryRun,
        )
        if (!trackedLoadResult.success) {
          return trackedLoadResult.result
        }

        const protectionLoadResult = await this.loadProtectionCacheIfEnabled(
          existingSeries.length,
          existingMovies.length,
          dryRun,
        )
        if (!protectionLoadResult.success) {
          return protectionLoadResult.result
        }
        const protectedGuids = protectionLoadResult.protectedGuids

        const safetyResult = performWatchlistSafetyCheck(
          existingSeries,
          existingMovies,
          allWatchlistItems,
          protectedGuids,
          this.config,
          this.trackedGuids,
          this.config.deleteSyncTrackedOnly,
          this.log,
        )

        if (!safetyResult.safe) {
          return this.handleSafetyTriggered(
            safetyResult.message,
            dryRun,
            existingSeries.length,
            existingMovies.length,
          )
        }

        // processDeleteSync reads this.protectedGuids, which ensureProtectionCache set above
        result = await this.processDeleteSync(
          existingSeries,
          existingMovies,
          allWatchlistItems,
          dryRun,
        )
      }

      this.log.info(
        `Delete sync${dryRun ? ' dry run' : ''} completed: ${result.movies.deleted} movies and ${result.shows.deleted} shows ${dryRun ? 'identified for deletion' : 'deleted'}, ${result.total.skipped} skipped, ${result.total.protected ?? 0} protected`,
      )

      const existingMovieGuids = createGuidSet(existingMovies)
      const existingSeriesGuids = createGuidSet(existingSeries)
      await cleanupOrphanedApprovalRequests(
        {
          db: this.dbService,
          approvalService: this.fastify.approvalService,
          existingMovieGuids,
          existingShowGuids: existingSeriesGuids,
          config: {
            deleteSyncCleanupApprovals: this.config.deleteSyncCleanupApprovals,
          },
          logger: this.log,
        },
        dryRun,
      )

      await cleanupApprovalRequestsForDeletedContent(
        {
          db: this.dbService,
          approvalService: this.fastify.approvalService,
          deletedMovieGuids: this.deletedMovieGuids,
          deletedShowGuids: this.deletedShowGuids,
          config: {
            deleteSyncCleanupApprovals: this.config.deleteSyncCleanupApprovals,
          },
          logger: this.log,
        },
        dryRun,
      )

      await cleanupRollingMonitoredShowsForDeletedContent(
        {
          db: this.dbService,
          deletedShowGuids: this.deletedShowGuids,
          logger: this.log,
        },
        dryRun,
      )

      void this.fastify.notifications.sendDeleteSyncNotification(result, dryRun)

      return result
    } catch (error) {
      this.logError('Error in delete sync operation:', error)
      throw error
    } finally {
      this._running = false
      this.fastify.plexServerService.clearWorkflowCaches()
      this.protectedGuids = null
      this.trackedGuids = null
      this.deletedMovieGuids.clear()
      this.deletedShowGuids.clear()
      this.clearTagCache()
    }
  }

  private handleEmptyResult(logMessage: string): DeleteSyncResult {
    this.log.info(logMessage)
    return createEmptyResult(logMessage)
  }

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

    void this.fastify.notifications.sendDeleteSyncNotification(result, dryRun)

    return result
  }

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

  private async refreshWatchlists(): Promise<{
    success: boolean
    message: string
  }> {
    const maxRetries = 2
    const baseDelay = 1000

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.log.debug(
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
        const message = `Failed to refresh watchlist data: ${errorMessage(refreshError)}`

        if (isLastAttempt) {
          this.log.error(
            { error: refreshError, attempts: attempt + 1 },
            'Error refreshing watchlist data after all retry attempts',
          )
          return { success: false, message }
        } else {
          const delay = baseDelay * 2 ** attempt
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

  private async fetchAllMediaContent(): Promise<{
    existingSeries: SonarrItem[]
    existingMovies: RadarrItem[]
  }> {
    this.log.debug('Retrieving all content from Sonarr and Radarr instances')
    const [existingSeries, existingMovies] = await Promise.all([
      this.sonarrManager.fetchAllSeries(true),
      this.radarrManager.fetchAllMovies(true),
    ])
    this.log.debug(
      `Found ${existingSeries.length} series in Sonarr and ${existingMovies.length} movies in Radarr`,
    )
    return { existingSeries, existingMovies }
  }

  private async loadTrackedCacheIfEnabled(
    seriesCount: number,
    moviesCount: number,
    dryRun: boolean,
  ): Promise<{ success: true } | { success: false; result: DeleteSyncResult }> {
    if (!this.config.deleteSyncTrackedOnly) {
      return { success: true }
    }

    this.log.debug(
      'Tracked-only deletion is enabled, so only content from the approval system will be deleted',
    )

    try {
      const trackedGuids = await this.ensureTrackedCache()

      if (!trackedGuids) {
        throw new Error('Failed to retrieve tracked content GUIDs')
      }

      this.log.debug(
        `Found ${trackedGuids.size} tracked content GUIDs in approval system`,
      )

      return { success: true }
    } catch (trackedError) {
      const errorMsg = `Error retrieving tracked content GUIDs: ${errorMessage(trackedError)}`
      this.log.error(
        {
          error: toError(trackedError),
        },
        errorMsg,
      )
      return {
        success: false,
        result: this.handleSafetyTriggered(
          errorMsg,
          dryRun,
          seriesCount,
          moviesCount,
        ),
      }
    }
  }

  private async loadProtectionCacheIfEnabled(
    seriesCount: number,
    moviesCount: number,
    dryRun: boolean,
  ): Promise<
    | { success: true; protectedGuids: Set<string> | null }
    | { success: false; protectedGuids: null; result: DeleteSyncResult }
  > {
    if (!this.config.enablePlexPlaylistProtection) {
      return { success: true, protectedGuids: null }
    }

    if (!this.fastify.plexServerService.isInitialized()) {
      return {
        success: false,
        protectedGuids: null,
        result: this.handleSafetyTriggered(
          'Plex playlist protection is enabled but the Plex server is not properly initialized, so deletion cannot proceed safely',
          dryRun,
          seriesCount,
          moviesCount,
        ),
      }
    }

    try {
      this.log.debug(
        `Beginning deletion analysis; Plex playlist protection enabled with playlist "${this.getProtectionPlaylistName()}"`,
      )

      const protectedGuids = await this.ensureProtectionCache()

      if (!protectedGuids) {
        throw new Error('Failed to retrieve protected items')
      }

      this.log.debug(
        `Protection playlists "${this.getProtectionPlaylistName()}" contain a total of ${protectedGuids.size} protected GUIDs`,
      )
      this.log.debug(
        'Protection uses standardized GUIDs for maximum compatibility across all systems',
      )

      return { success: true, protectedGuids }
    } catch (protectedItemsError) {
      const errorMsg = `Error retrieving protected items from playlists: ${errorMessage(protectedItemsError)}`
      this.log.error(
        {
          error: toError(protectedItemsError),
        },
        errorMsg,
      )
      return {
        success: false,
        protectedGuids: null,
        result: this.handleSafetyTriggered(
          errorMsg,
          dryRun,
          seriesCount,
          moviesCount,
        ),
      }
    }
  }

  private logError(message: string, error: unknown): void {
    this.log.error({ error: toError(error) }, message)
  }

  private async updateUserTags(
    existingSeries: SonarrItem[],
    existingMovies: RadarrItem[],
  ): Promise<{ success: boolean; tagged: boolean; message: string }> {
    this.log.debug('Updating user tags before delete sync')

    try {
      const userTagService = this.fastify.userTags
      if (!userTagService) {
        this.log.warn('UserTagService not available, skipping tag update')
        return {
          success: true,
          tagged: false,
          message: 'User tag update skipped',
        }
      }

      const movieWatchlistItems =
        await this.fastify.db.getAllMovieWatchlistItems()
      const showWatchlistItems =
        await this.fastify.db.getAllShowWatchlistItems()

      const results: TaggingResults[] = []
      if (this.config.tagUsersInRadarr && existingMovies.length > 0) {
        results.push(
          await userTagService.tagRadarrContentWithData(
            existingMovies,
            movieWatchlistItems,
          ),
        )
      }

      if (this.config.tagUsersInSonarr && existingSeries.length > 0) {
        results.push(
          await userTagService.tagSonarrContentWithData(
            existingSeries,
            showWatchlistItems,
          ),
        )
      }

      const failedInstances = results.reduce(
        (sum, result) => sum + result.failedInstances,
        0,
      )
      const failedItems = results.reduce(
        (sum, result) => sum + result.failed,
        0,
      )
      if (failedInstances > 0 || failedItems > 0) {
        return {
          success: false,
          tagged: true,
          message: `Failed to update user tags before delete sync (${failedInstances} instance(s) and ${failedItems} item(s) failed)`,
        }
      }

      this.log.debug('User tags updated successfully')
      return {
        success: true,
        tagged: results.length > 0,
        message: 'User tags updated successfully',
      }
    } catch (error) {
      this.log.error({ error }, 'Error updating user tags:')
      return {
        success: false,
        tagged: true,
        message: `Failed to update user tags before delete sync: ${errorMessage(error)}`,
      }
    }
  }

  private isDeleteEnabled(): boolean {
    return (
      this.config.deleteMovie ||
      this.config.deleteEndedShow ||
      this.config.deleteContinuingShow
    )
  }

  private getDeletionMode(): 'watchlist' | 'tag-based' {
    return this.config.deletionMode || 'watchlist'
  }

  private async processTagBasedDeleteSync(
    existingSeries: SonarrItem[],
    existingMovies: RadarrItem[],
    dryRun = false,
  ): Promise<DeleteSyncResult> {
    const trackedLoadResult = await this.loadTrackedCacheIfEnabled(
      existingSeries.length,
      existingMovies.length,
      dryRun,
    )
    if (!trackedLoadResult.success) {
      return trackedLoadResult.result
    }

    const protectionLoadResult = await this.loadProtectionCacheIfEnabled(
      existingSeries.length,
      existingMovies.length,
      dryRun,
    )
    if (!protectionLoadResult.success) {
      return protectionLoadResult.result
    }

    const exclusionDrivenGuids =
      await this.dbService.getExclusionDrivenDeletionGuids()
    if (exclusionDrivenGuids.movie.size + exclusionDrivenGuids.show.size > 0) {
      this.log.debug(
        `Loaded ${exclusionDrivenGuids.movie.size} movie and ${exclusionDrivenGuids.show.size} show exclusion-driven deletion GUID(s) for tag-based delete sync`,
      )
    }

    const result = await executeTagBasedDeletion(
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
          maxDeletionPrevention:
            this.config.maxDeletionPrevention ??
            MAX_DELETION_PREVENTION.default,
          deleteSyncRequiredTagRegex: this.config.deleteSyncRequiredTagRegex,
        },
        sonarrManager: this.sonarrManager,
        radarrManager: this.radarrManager,
        tagCache: this.tagCache,
        protectedGuids: this.protectedGuids,
        trackedGuids: this.trackedGuids,
        exclusionDrivenGuids,
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
    if (result.safetyTriggered) {
      void this.fastify.notifications.sendDeleteSyncNotification(result, dryRun)
    }
    return result
  }

  private clearTagCache(): void {
    this.tagCache.clear()
  }

  private getProtectionPlaylistName(): string {
    return (
      this.config.plexProtectionPlaylistName || PLEX_PROTECTION_PLAYLIST_DEFAULT
    )
  }

  /** Watchlisted GUIDs minus excluded routed items, filtered in memory so dry and real runs agree. */
  private async getWatchlistGuids(
    respectUserSyncSetting = false,
  ): Promise<Set<string>> {
    try {
      const watchlistItems = await fetchWatchlistItems(respectUserSyncSetting, {
        db: this.dbService,
        logger: this.log,
      })
      const exclusionMap = await this.dbService.getExclusionMap()
      const survivors = filterExcludedRoutedItems(watchlistItems, exclusionMap)
      return extractGuidsFromWatchlistItems(survivors, this.log)
    } catch (error) {
      this.log.error({ error }, 'Error in getWatchlistGuids:')
      throw error
    }
  }

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
