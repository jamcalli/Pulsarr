/**
 * Plex Session Monitor Service
 *
 * Monitors Plex sessions and triggers Sonarr searches based on viewing patterns
 * Implements "rolling" monitoring for progressive season downloads
 */
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import type { PlexServerService } from '@utils/plex-server.js'
import type { SonarrManagerService } from './sonarr-manager.service.js'
import type { DatabaseService } from './database.service.js'
import type { SonarrSeries } from '@root/types/sonarr.types.js'
import type {
  PlexSession,
  RollingMonitoredShow,
  SessionMonitoringResult,
} from '@root/types/plex-session.types.js'
import {
  extractTvdbId,
  normalizeGuid,
  parseGuids,
} from '@utils/guid-handler.js'

export class PlexSessionMonitorService {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
    private readonly plexServer: PlexServerService,
    private readonly sonarrManager: SonarrManagerService,
    private readonly db: DatabaseService,
  ) {
    this.log.info('PlexSessionMonitorService initialized')
  }

  /**
   * Access to application configuration
   */
  private get config() {
    return this.fastify.config
  }

  /**
   * Main monitoring function - checks sessions and triggers Sonarr actions
   */
  async monitorSessions(): Promise<SessionMonitoringResult> {
    const result: SessionMonitoringResult = {
      processedSessions: 0,
      triggeredSearches: 0,
      errors: [],
      rollingUpdates: [],
    }

    try {
      // Get active sessions
      const sessions = await this.plexServer.getActiveSessions()

      if (!sessions || sessions.length === 0) {
        this.log.debug('No active Plex sessions found')
        return result
      }

      this.log.info(`Found ${sessions.length} active Plex sessions`)

      // Process each session
      for (const session of sessions) {
        try {
          await this.processSession(session, result)
        } catch (error) {
          const errorMsg = `Error processing session for ${session.grandparentTitle || 'Unknown'}: ${error}`
          this.log.error(errorMsg)
          result.errors.push(errorMsg)
        }
      }

      this.log.info(
        `Session monitoring complete. Processed: ${result.processedSessions}, Triggered: ${result.triggeredSearches}`,
      )

      return result
    } catch (error) {
      const errorMsg = `Fatal error in session monitoring: ${error}`
      this.log.error(errorMsg)
      result.errors.push(errorMsg)
      return result
    }
  }

  /**
   * Check if a user is allowed to trigger monitoring actions
   */
  private isUserAllowedToTriggerActions(
    userId: string,
    username: string,
  ): boolean {
    if (
      !this.config.plexSessionMonitoring?.filterUsers ||
      this.config.plexSessionMonitoring.filterUsers.length === 0
    ) {
      // No filtering configured, all users allowed
      return true
    }

    const allowedUsers = this.config.plexSessionMonitoring.filterUsers
    return allowedUsers.includes(userId) || allowedUsers.includes(username)
  }

  /**
   * Process a single Plex session
   */
  private async processSession(
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    // Only process TV episodes
    if (session.type !== 'episode') {
      return
    }

    // Determine if this user is allowed to trigger monitoring actions
    const canTriggerActions = this.isUserAllowedToTriggerActions(
      session.User.id,
      session.User.title,
    )

    if (!canTriggerActions) {
      this.log.debug(
        `User ${session.User.title} not in filter list - will track progress but not trigger monitoring actions`,
      )
    }

    result.processedSessions++

    const episodeInfo = `${session.grandparentTitle} S${String(session.parentIndex).padStart(2, '0')}E${String(session.index).padStart(2, '0')}`
    this.log.info(
      `Processing session: ${episodeInfo} watched by ${session.User.title}`,
    )

    // Always check for rolling monitored show (per-user lookup)
    const rollingShow = await this.getRollingMonitoredShow(session)

    if (rollingShow) {
      await this.handleRollingMonitoredShow(
        session,
        rollingShow,
        result,
        canTriggerActions,
      )
    } else {
      // Skip shows that are not configured for rolling monitoring
      this.log.debug(
        `Skipping ${session.grandparentTitle} - not configured for rolling monitoring for user ${session.User.title}`,
      )
    }
  }

  /**
   * Handle rolling monitored shows
   */
  private async handleRollingMonitoredShow(
    session: PlexSession,
    rollingShow: RollingMonitoredShow,
    result: SessionMonitoringResult,
    canTriggerActions = true,
  ): Promise<void> {
    const currentSeason = session.parentIndex
    const currentEpisode = session.index

    // Always update progress tracking (regardless of user filtering)
    await this.updateRollingShowProgress(
      rollingShow.id,
      currentSeason,
      currentEpisode,
      canTriggerActions,
    )

    // Only trigger monitoring actions if user is allowed (respects user filtering)
    if (!canTriggerActions) {
      this.log.debug(
        `User ${session.User.title} progress tracked but not triggering monitoring actions due to user filtering`,
      )
      return
    }

    // Special case for pilot rolling: if watching the pilot episode, expand immediately
    if (
      rollingShow.monitoring_type === 'pilotRolling' &&
      currentSeason === 1 &&
      currentEpisode === 1
    ) {
      await this.expandPilotToFullSeason(rollingShow, session, result)
      return
    }

    // Check if we need to expand monitoring using Sonarr data
    const currentSeasonData = await this.getSonarrSeriesData(session)
    if (!currentSeasonData) return

    const season = currentSeasonData.series.seasons?.find(
      (s) => s.seasonNumber === currentSeason,
    )
    if (!season?.statistics?.totalEpisodeCount) return

    const totalEpisodes = season.statistics.totalEpisodeCount
    const remainingEpisodes = totalEpisodes - currentEpisode
    const threshold = this.config.plexSessionMonitoring?.remainingEpisodes || 2

    if (remainingEpisodes <= threshold && remainingEpisodes >= 0) {
      // User is near the end of the current monitored season
      const hasMoreSeasons = currentSeasonData.series.seasons?.some(
        (s) => s.seasonNumber > currentSeason,
      )

      if (
        hasMoreSeasons &&
        currentSeason >= rollingShow.current_monitored_season
      ) {
        // Expand to next season
        await this.expandMonitoringToNextSeason(rollingShow, session, result)
      } else if (!hasMoreSeasons) {
        // No more seasons in Plex, switch to monitoring all
        await this.switchToMonitorAll(rollingShow, session, result)
      }
    }
  }

  /**
   * Get series identifiers (TVDB ID, etc.) from Plex metadata using robust GUID handling
   */
  private async getSeriesIdentifiers(
    session: PlexSession,
  ): Promise<{ tvdbId?: string; imdbId?: string } | null> {
    try {
      const ratingKey = session.grandparentKey.split('/').pop()
      if (!ratingKey) {
        this.log.debug(
          `No rating key found for ${session.grandparentTitle}, will fallback to title matching`,
        )
        return {}
      }

      // Use the existing method to get show metadata
      // When includeChildren is false, we get the detailed metadata response
      const metadata = await this.plexServer.getShowMetadata(ratingKey, false)

      if (!metadata?.MediaContainer?.Metadata?.[0]?.Guid) {
        this.log.debug(
          `No Guid array found for ${session.grandparentTitle}, will fallback to title matching`,
        )
        return {}
      }

      // Extract all available GUIDs using robust parsing
      const allGuids: string[] = []

      // Get the first metadata item
      const metadataItem = metadata.MediaContainer.Metadata[0]
      if (!metadataItem) {
        this.log.debug(`No metadata item found for ${session.grandparentTitle}`)
        return {}
      }

      // Add main GUID if available (check both cases for compatibility)
      if (metadataItem.guid) {
        // Don't normalize plex:// GUIDs as they're internal
        if (!metadataItem.guid.startsWith('plex://')) {
          // Use centralized normalization
          const normalizedGuid = normalizeGuid(metadataItem.guid)
          allGuids.push(normalizedGuid)
        }
      }

      // Add additional GUIDs from Guid array
      if (Array.isArray(metadataItem.Guid)) {
        for (const guidObj of metadataItem.Guid) {
          if (guidObj.id && !guidObj.id.startsWith('plex://')) {
            // Use centralized normalization
            const normalizedGuid = normalizeGuid(guidObj.id)
            allGuids.push(normalizedGuid)
          }
        }
      }

      // Use the robust GUID handler to extract TVDB ID
      const tvdbId = extractTvdbId(allGuids)

      const result: { tvdbId?: string; imdbId?: string } = {}
      if (tvdbId > 0) {
        result.tvdbId = tvdbId.toString()
      }

      // For IMDB, look for imdb: prefixed IDs in the normalized GUID list
      const parsedGuids = parseGuids(allGuids)
      for (const guid of parsedGuids) {
        if (guid.startsWith('imdb:')) {
          const imdbId = guid.substring(5) // Remove 'imdb:' prefix
          if (imdbId.length > 2) {
            result.imdbId = imdbId
            break
          }
        }
      }

      this.log.debug(
        `Extracted identifiers for ${session.grandparentTitle}:`,
        result,
      )
      return result
    } catch (error) {
      this.log.debug(
        `Could not fetch metadata for ${session.grandparentTitle}, will fallback to title matching:`,
        error,
      )
      return {} // Return empty object to allow title fallback
    }
  }

  /**
   * Find series across all Sonarr instances
   */
  private async findSeriesInSonarr(
    identifiers: { tvdbId?: string; imdbId?: string },
    title: string,
  ): Promise<{ series: SonarrSeries; instanceId: number } | null> {
    const instances = await this.sonarrManager.getAllInstances()

    this.log.debug(
      `Searching for series in ${instances.length} Sonarr instances`,
      {
        identifiers,
        title,
      },
    )

    for (const instance of instances) {
      try {
        const sonarr = this.sonarrManager.getInstance(instance.id)
        if (!sonarr) continue

        const allSeries = await sonarr.getAllSeries()

        // Try to match by TVDB ID first (primary identifier)
        if (identifiers.tvdbId) {
          const tvdbId = identifiers.tvdbId
          const tvdbIdNum = Number.parseInt(tvdbId, 10)

          const series = allSeries.find((s) => s.tvdbId === tvdbIdNum)
          if (series) {
            this.log.debug(
              `Found match by TVDB ID: ${series.title} (${series.tvdbId})`,
            )
            return { series, instanceId: instance.id }
          }
        }

        // Try IMDB ID as secondary identifier
        if (identifiers.imdbId) {
          const series = allSeries.find((s) => s.imdbId === identifiers.imdbId)
          if (series) {
            this.log.debug(
              `Found match by IMDB ID: ${series.title} (${identifiers.imdbId})`,
            )
            return { series, instanceId: instance.id }
          }
        }

        // Enhanced title matching as fallback
        const series = allSeries.find((s) => {
          const sonarrTitle = s.title.toLowerCase()
          const searchTitle = title.toLowerCase()

          // Exact match
          if (sonarrTitle === searchTitle) return true

          // Match without year suffix (e.g., "Versailles" matches "Versailles (2015)")
          const titleWithoutYear = sonarrTitle.replace(/\s*\(\d{4}\)\s*$/, '')
          if (titleWithoutYear === searchTitle) return true

          // Match with "The" prefix variations
          if (sonarrTitle === `the ${searchTitle}`) return true
          if (`the ${sonarrTitle}` === searchTitle) return true

          return false
        })

        if (series) {
          this.log.debug(`Found match by title: ${series.title}`)
          return { series, instanceId: instance.id }
        }
      } catch (error) {
        this.log.error(
          { error },
          `Error searching Sonarr instance ${instance.id}:`,
        )
      }
    }

    return null
  }

  /**
   * Helper method to get Sonarr series data for a session
   */
  private async getSonarrSeriesData(
    session: PlexSession,
  ): Promise<{ series: SonarrSeries; instanceId: number } | null> {
    try {
      const seriesIds = await this.getSeriesIdentifiers(session)
      if (!seriesIds) return null

      return await this.findSeriesInSonarr(seriesIds, session.grandparentTitle)
    } catch (error) {
      this.log.error({ error }, 'Error getting Sonarr series data:')
      return null
    }
  }

  /**
   * Get rolling monitored show from database for the specific user
   * Handles migration from global to per-user entries
   */
  private async getRollingMonitoredShow(
    session: PlexSession,
  ): Promise<RollingMonitoredShow | null> {
    try {
      const identifiers = await this.getSeriesIdentifiers(session)
      const tvdbId = identifiers?.tvdbId

      // First, check for global entry to see if this show should be monitored
      const globalShow = await this.db.getRollingMonitoredShow(
        tvdbId,
        session.grandparentTitle,
        undefined, // Look for global entry (null plex_user_id)
      )

      if (!globalShow) {
        // No global entry means this show is not configured for rolling monitoring
        return null
      }

      // Now try to find user-specific entry for progress tracking
      let rollingShow = await this.db.getRollingMonitoredShow(
        tvdbId,
        session.grandparentTitle,
        session.User.id, // Pass user ID for per-user entries
      )

      // If no user-specific entry found, create one based on global entry
      if (!rollingShow) {
        this.log.info(
          `Creating per-user rolling show entry for ${globalShow.show_title} for user ${session.User.title}`,
        )

        const userEntryId = await this.db.createRollingMonitoredShow({
          sonarr_series_id: globalShow.sonarr_series_id,
          sonarr_instance_id: globalShow.sonarr_instance_id,
          tvdb_id: globalShow.tvdb_id,
          imdb_id: globalShow.imdb_id,
          show_title: globalShow.show_title,
          monitoring_type: globalShow.monitoring_type,
          current_monitored_season: 1, // New users always start from season 1
          plex_user_id: session.User.id,
          plex_username: session.User.title,
        })

        // Get the newly created per-user entry
        rollingShow = await this.db.getRollingMonitoredShowById(userEntryId)
      }

      return rollingShow
    } catch (error) {
      this.log.error({ error }, 'Error getting rolling monitored show:')
      return null
    }
  }

  /**
   * Update rolling show progress
   */
  private async updateRollingShowProgress(
    showId: number,
    season: number,
    episode: number,
    canTriggerActions = true,
  ): Promise<void> {
    try {
      await this.db.updateRollingShowProgress(showId, season, episode)

      // Check if progressive cleanup is enabled and trigger cleanup if needed
      // Only trigger for users allowed to perform monitoring actions
      if (
        this.config.plexSessionMonitoring?.enableProgressiveCleanup &&
        canTriggerActions
      ) {
        const rollingShow = await this.db.getRollingMonitoredShowById(showId)
        if (rollingShow) {
          await this.checkAndPerformProgressiveCleanup(rollingShow, season)
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Error updating rolling show progress:')
    }
  }

  /**
   * Expand monitoring to next season
   */
  private async expandMonitoringToNextSeason(
    rollingShow: RollingMonitoredShow,
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    const nextSeason = rollingShow.current_monitored_season + 1

    try {
      const sonarr = this.sonarrManager.getInstance(
        rollingShow.sonarr_instance_id,
      )
      if (!sonarr) return

      // Update Sonarr to monitor the next season
      await sonarr.updateSeasonMonitoring(
        rollingShow.sonarr_series_id,
        nextSeason,
        true,
      )

      // Search for the newly monitored season
      await sonarr.searchSeason(rollingShow.sonarr_series_id, nextSeason)

      // Update database
      await this.db.updateRollingShowMonitoredSeason(rollingShow.id, nextSeason)

      result.rollingUpdates.push({
        showTitle: session.grandparentTitle,
        action: 'expanded_to_next_season',
        details: `Now monitoring up to season ${nextSeason}`,
      })

      result.triggeredSearches++

      this.log.info(
        `Expanded monitoring for ${session.grandparentTitle} to include season ${nextSeason}`,
      )
    } catch (error) {
      this.log.error(
        `Failed to expand monitoring for ${session.grandparentTitle}:`,
        error,
      )
    }
  }

  /**
   * Expand pilot rolling to monitor full first season
   */
  private async expandPilotToFullSeason(
    rollingShow: RollingMonitoredShow,
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getInstance(
        rollingShow.sonarr_instance_id,
      )
      if (!sonarr) return

      // Search for the full first season (pilot is already monitored)
      await sonarr.searchSeason(rollingShow.sonarr_series_id, 1)

      result.rollingUpdates.push({
        showTitle: session.grandparentTitle,
        action: 'expanded_to_season',
        details: 'Pilot viewed - now searching for full Season 1',
      })

      result.triggeredSearches++

      this.log.info(
        `Expanded pilot monitoring for ${session.grandparentTitle} to search full Season 1`,
      )
    } catch (error) {
      this.log.error(
        `Failed to expand pilot monitoring for ${session.grandparentTitle}:`,
        error,
      )
    }
  }

  /**
   * Switch to monitoring all seasons
   */
  private async switchToMonitorAll(
    rollingShow: RollingMonitoredShow,
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getInstance(
        rollingShow.sonarr_instance_id,
      )
      if (!sonarr) return

      // Update series to monitor all new items
      await sonarr.updateSeriesMonitoring(rollingShow.sonarr_series_id, {
        monitored: true,
        monitorNewItems: 'all',
      })

      // Remove from rolling monitoring
      await this.db.deleteRollingMonitoredShow(rollingShow.id)

      result.rollingUpdates.push({
        showTitle: session.grandparentTitle,
        action: 'switched_to_all',
        details: 'Now monitoring all future seasons automatically',
      })

      this.log.info(
        `Switched ${session.grandparentTitle} to monitor all future seasons`,
      )
    } catch (error) {
      this.log.error(
        `Failed to switch ${session.grandparentTitle} to monitor all:`,
        error,
      )
    }
  }

  /**
   * Create a rolling monitored show entry
   */
  async createRollingMonitoredShow(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    tvdbId: string,
    showTitle: string,
    monitoringType: 'pilotRolling' | 'firstSeasonRolling',
  ): Promise<void> {
    try {
      const initialSeason = 1 // Both pilotRolling and firstSeasonRolling start with season 1

      await this.db.createRollingMonitoredShow({
        sonarr_series_id: sonarrSeriesId,
        sonarr_instance_id: sonarrInstanceId,
        tvdb_id: tvdbId,
        imdb_id: undefined,
        show_title: showTitle,
        monitoring_type: monitoringType,
        current_monitored_season: initialSeason,
        plex_user_id: undefined,
        plex_username: undefined,
      })
    } catch (error) {
      this.log.error({ error }, 'Error creating rolling monitored show:')
      throw error
    }
  }

  /**
   * Reset a rolling monitored show to pilot-only monitoring
   * Deletes all episode files except S01E01 and unmonitors them
   */
  async resetToPilotOnly(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    showTitle: string,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getInstance(sonarrInstanceId)
      if (!sonarr) {
        throw new Error(`Sonarr instance ${sonarrInstanceId} not found`)
      }

      // Get all episodes for the series
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      // Find the pilot episode (S01E01)
      const pilotEpisode = allEpisodes.find(
        (ep) => ep.seasonNumber === 1 && ep.episodeNumber === 1,
      )

      if (!pilotEpisode) {
        throw new Error(`Pilot episode not found for series ${sonarrSeriesId}`)
      }

      // Find all other episodes that have files and need to be deleted
      const episodesToDelete = allEpisodes.filter(
        (ep) =>
          ep.id !== pilotEpisode.id &&
          ep.hasFile === true &&
          ep.episodeFileId > 0,
      )

      // Find all other episodes that need to be unmonitored
      const episodesToUnmonitor = allEpisodes
        .filter((ep) => ep.id !== pilotEpisode.id && ep.monitored === true)
        .map((ep) => ({ id: ep.id, monitored: false }))

      let deletedCount = 0
      if (episodesToDelete.length > 0) {
        // Delete episode files first
        const episodeFileIds = episodesToDelete.map((ep) => ep.episodeFileId)
        await sonarr.deleteEpisodeFiles(episodeFileIds)
        deletedCount = episodeFileIds.length
      }

      if (episodesToUnmonitor.length > 0) {
        // Then unmonitor all episodes except the pilot
        await sonarr.updateEpisodesMonitoring(episodesToUnmonitor)
      }

      // Unmonitor all seasons except season 1 (which should only have pilot monitored)
      const allEpisodesGroupedBySeason = new Map<number, typeof allEpisodes>()
      for (const ep of allEpisodes) {
        if (!allEpisodesGroupedBySeason.has(ep.seasonNumber)) {
          allEpisodesGroupedBySeason.set(ep.seasonNumber, [])
        }
        allEpisodesGroupedBySeason.get(ep.seasonNumber)?.push(ep)
      }

      // Unmonitor all seasons except season 1
      for (const seasonNumber of allEpisodesGroupedBySeason.keys()) {
        if (seasonNumber > 1) {
          await sonarr.updateSeasonMonitoring(
            sonarrSeriesId,
            seasonNumber,
            false,
          )
        }
      }

      const unmonitoredSeasons = Array.from(
        allEpisodesGroupedBySeason.keys(),
      ).filter((s) => s > 1)
      this.log.info(
        `Reset ${showTitle} to pilot-only: deleted ${deletedCount} episode files, unmonitored ${episodesToUnmonitor.length} episodes and ${unmonitoredSeasons.length} seasons`,
      )
    } catch (error) {
      this.log.error({ error }, `Error resetting ${showTitle} to pilot-only:`)
      throw error
    }
  }

  /**
   * Reset a rolling monitored show to first-season-only monitoring
   * Deletes all episode files after Season 1 and unmonitors them
   */
  async resetToFirstSeasonOnly(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    showTitle: string,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getInstance(sonarrInstanceId)
      if (!sonarr) {
        throw new Error(`Sonarr instance ${sonarrInstanceId} not found`)
      }

      // Get all episodes for the series
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      // Find episodes after season 1 that have files and need to be deleted
      const episodesToDelete = allEpisodes.filter(
        (ep) =>
          ep.seasonNumber > 1 && ep.hasFile === true && ep.episodeFileId > 0,
      )

      // Find episodes after season 1 that need to be unmonitored
      const episodesToUnmonitor = allEpisodes
        .filter((ep) => ep.seasonNumber > 1 && ep.monitored === true)
        .map((ep) => ({ id: ep.id, monitored: false }))

      let deletedCount = 0
      if (episodesToDelete.length > 0) {
        // Delete episode files first
        const episodeFileIds = episodesToDelete.map((ep) => ep.episodeFileId)
        await sonarr.deleteEpisodeFiles(episodeFileIds)
        deletedCount = episodeFileIds.length
      }

      if (episodesToUnmonitor.length > 0) {
        // Then unmonitor all episodes after season 1
        await sonarr.updateEpisodesMonitoring(episodesToUnmonitor)
      }

      // Unmonitor all seasons after season 1
      const allEpisodesGroupedBySeason = new Map<number, typeof allEpisodes>()
      for (const ep of allEpisodes) {
        if (!allEpisodesGroupedBySeason.has(ep.seasonNumber)) {
          allEpisodesGroupedBySeason.set(ep.seasonNumber, [])
        }
        allEpisodesGroupedBySeason.get(ep.seasonNumber)?.push(ep)
      }

      // Unmonitor all seasons after season 1
      for (const seasonNumber of allEpisodesGroupedBySeason.keys()) {
        if (seasonNumber > 1) {
          await sonarr.updateSeasonMonitoring(
            sonarrSeriesId,
            seasonNumber,
            false,
          )
        }
      }

      const unmonitoredSeasons = Array.from(
        allEpisodesGroupedBySeason.keys(),
      ).filter((s) => s > 1)
      this.log.info(
        `Reset ${showTitle} to first-season-only: deleted ${deletedCount} episode files, unmonitored ${episodesToUnmonitor.length} episodes and ${unmonitoredSeasons.length} seasons (2+)`,
      )
    } catch (error) {
      this.log.error(
        `Error resetting ${showTitle} to first-season-only:`,
        error,
      )
      throw error
    }
  }

  /**
   * Reset inactive rolling monitored shows to their original monitoring state
   * Removes all user entries and resets master records to season 1
   * Should be called periodically to clean up shows that haven't been watched recently
   */
  async resetInactiveRollingShows(inactivityDays = 7): Promise<void> {
    try {
      // Get all rolling monitored shows that haven't been updated recently
      const inactiveShows =
        await this.db.getInactiveRollingMonitoredShows(inactivityDays)

      if (inactiveShows.length === 0) {
        this.log.debug('No inactive rolling monitored shows found')
        return
      }

      this.log.info(
        `Found ${inactiveShows.length} inactive rolling monitored shows to reset`,
      )

      for (const show of inactiveShows) {
        try {
          if (show.monitoring_type === 'pilotRolling') {
            await this.resetToPilotOnly(
              show.sonarr_series_id,
              show.sonarr_instance_id,
              show.show_title,
            )
          } else if (show.monitoring_type === 'firstSeasonRolling') {
            await this.resetToFirstSeasonOnly(
              show.sonarr_series_id,
              show.sonarr_instance_id,
              show.show_title,
            )
          }

          // Remove all user entries and reset master record to original state
          const deletedUserEntries =
            await this.db.resetRollingMonitoredShowToOriginal(show.id)

          this.log.info(
            `Successfully reset inactive rolling show: ${show.show_title}${deletedUserEntries > 0 ? ` (removed ${deletedUserEntries} user ${deletedUserEntries === 1 ? 'entry' : 'entries'})` : ''}`,
          )
        } catch (error) {
          this.log.error(
            `Failed to reset inactive rolling show ${show.show_title}:`,
            error,
          )
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Error resetting inactive rolling shows:')
      throw error
    }
  }

  /**
   * Progressive cleanup for rolling monitored shows
   * Removes previous seasons when a user progresses to the next season,
   * but only if no filtered users (including current user) have watched those
   * seasons within the configured inactivity period. Only considers users that
   * are allowed to trigger monitoring actions. Always preserves the original
   * monitoring state (pilot or full season 1)
   */
  private async checkAndPerformProgressiveCleanup(
    rollingShow: RollingMonitoredShow,
    currentSeason: number,
  ): Promise<void> {
    try {
      this.log.debug(
        `Progressive cleanup check for ${rollingShow.show_title}: current season ${currentSeason}, last watched season ${rollingShow.last_watched_season}`,
      )

      this.log.debug(
        'Progressive cleanup proceeding - checking if any previous seasons can be cleaned up',
      )

      // Get the inactivity threshold from config
      const inactivityDays =
        this.config.plexSessionMonitoring?.inactivityResetDays || 7

      // Find all rolling show entries for this same series (filtered users only)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - inactivityDays)

      const allRollingShows = await this.db.getRollingMonitoredShows()
      const allUsersWatchingShow = allRollingShows.filter(
        (show) =>
          show.sonarr_series_id === rollingShow.sonarr_series_id &&
          show.sonarr_instance_id === rollingShow.sonarr_instance_id &&
          new Date(show.last_session_date) >= cutoffDate &&
          // Only consider users that are allowed to trigger monitoring actions
          this.isUserAllowedToTriggerActions(
            show.plex_user_id || '',
            show.plex_username || '',
          ),
      )

      this.log.debug(
        `Progressive cleanup safety check: found ${allUsersWatchingShow.length} active filtered users for ${rollingShow.show_title}`,
      )

      // Determine which seasons to clean up based on monitoring type
      const seasonsToCleanup: number[] = []

      if (rollingShow.monitoring_type === 'pilotRolling') {
        this.log.debug(
          `Processing pilot rolling cleanup for ${rollingShow.show_title}`,
        )

        // For pilot rolling: clean up Season 2+ (never clean Season 1 as it should stay pilot-only)
        for (let season = 2; season < currentSeason; season++) {
          const anyUserWatchingSeason = allUsersWatchingShow.some(
            (show) =>
              show.last_watched_season <= season &&
              show.current_monitored_season >= season,
          )
          this.log.debug(
            `Season ${season} check - any filtered user watching: ${anyUserWatchingSeason}`,
          )
          if (!anyUserWatchingSeason) {
            seasonsToCleanup.push(season)
          }
        }

        // Check if Season 1 needs to be reset back to pilot-only (when watching S2+)
        if (currentSeason > 1) {
          const anyUserWatchingSeason1 = allUsersWatchingShow.some(
            (show) =>
              show.last_watched_season <= 1 &&
              show.current_monitored_season >= 1,
          )
          this.log.debug(
            `Season 1 pilot reset check - any filtered user watching S1: ${anyUserWatchingSeason1}, currentSeason: ${currentSeason}`,
          )

          if (!anyUserWatchingSeason1) {
            // Check if Season 1 is already in pilot-only state before resetting
            const isAlreadyPilotOnly = await this.isSeasonAlreadyPilotOnly(
              rollingShow.sonarr_series_id,
              rollingShow.sonarr_instance_id,
            )

            if (!isAlreadyPilotOnly) {
              this.log.debug(
                `Resetting Season 1 of ${rollingShow.show_title} back to pilot-only`,
              )
              await this.resetSeasonToPilotOnly(
                rollingShow.sonarr_series_id,
                rollingShow.sonarr_instance_id,
                rollingShow.show_title,
              )
            } else {
              this.log.debug(
                `Season 1 of ${rollingShow.show_title} is already pilot-only, skipping reset`,
              )
            }
          } else {
            this.log.debug(
              'NOT resetting Season 1 - some filtered user still watching Season 1',
            )
          }
        } else {
          this.log.debug(
            'Skipping Season 1 reset check - still watching Season 1',
          )
        }
      } else if (rollingShow.monitoring_type === 'firstSeasonRolling') {
        // For first season rolling: clean up Season 2+ (keep Season 1 fully monitored)
        for (let season = 2; season < currentSeason; season++) {
          const anyUserWatchingSeason = allUsersWatchingShow.some(
            (show) =>
              show.last_watched_season <= season &&
              show.current_monitored_season >= season,
          )
          if (!anyUserWatchingSeason) {
            seasonsToCleanup.push(season)
          }
        }
      }

      // Perform cleanup for safe seasons
      if (seasonsToCleanup.length > 0) {
        this.log.info(
          `Progressive cleanup for ${rollingShow.show_title}: removing seasons ${seasonsToCleanup.join(', ')}`,
        )

        await this.cleanupSpecificSeasons(
          rollingShow.sonarr_series_id,
          rollingShow.sonarr_instance_id,
          rollingShow.show_title,
          seasonsToCleanup,
        )
      }
    } catch (error) {
      this.log.error({ error }, 'Error in progressive cleanup:')
    }
  }

  /**
   * Check if Season 1 is already in pilot-only state (only S01E01 monitored and has file)
   */
  private async isSeasonAlreadyPilotOnly(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
  ): Promise<boolean> {
    try {
      const sonarr = this.sonarrManager.getInstance(sonarrInstanceId)
      if (!sonarr) {
        return false
      }

      // Get all episodes for the series
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      // Find all Season 1 episodes
      const season1Episodes = allEpisodes.filter((ep) => ep.seasonNumber === 1)
      if (season1Episodes.length === 0) {
        return false
      }

      // Find the pilot episode (S01E01)
      const pilotEpisode = season1Episodes.find((ep) => ep.episodeNumber === 1)
      if (!pilotEpisode) {
        return false
      }

      // Check if only the pilot is monitored and all other S1 episodes are unmonitored
      const nonPilotEpisodes = season1Episodes.filter(
        (ep) => ep.id !== pilotEpisode.id,
      )
      const allNonPilotUnmonitored = nonPilotEpisodes.every(
        (ep) => !ep.monitored,
      )
      const pilotIsMonitored = pilotEpisode.monitored

      this.log.debug(
        `Pilot-only check for series ${sonarrSeriesId}: pilot monitored: ${pilotIsMonitored}, non-pilot episodes unmonitored: ${allNonPilotUnmonitored} (${nonPilotEpisodes.length} episodes)`,
      )

      return pilotIsMonitored && allNonPilotUnmonitored
    } catch (error) {
      this.log.debug(
        `Error checking pilot-only state for series ${sonarrSeriesId}:`,
        error,
      )
      return false
    }
  }

  /**
   * Reset Season 1 back to pilot-only monitoring (for pilotRolling shows)
   * Based on the existing resetToPilotOnly method but only operates on Season 1
   */
  private async resetSeasonToPilotOnly(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    showTitle: string,
  ): Promise<void> {
    try {
      this.log.debug(
        `Starting Season 1 pilot reset for ${showTitle} (Sonarr series ${sonarrSeriesId})`,
      )

      const sonarr = this.sonarrManager.getInstance(sonarrInstanceId)
      if (!sonarr) {
        this.log.debug(`ERROR: Sonarr instance ${sonarrInstanceId} not found`)
        throw new Error(`Sonarr instance ${sonarrInstanceId} not found`)
      }

      this.log.debug(`Fetching all episodes for series ${sonarrSeriesId}`)
      // Get all episodes for the series
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)
      this.log.debug(`Found ${allEpisodes.length} total episodes`)

      // Find the pilot episode (S01E01)
      const pilotEpisode = allEpisodes.find(
        (ep) => ep.seasonNumber === 1 && ep.episodeNumber === 1,
      )

      if (!pilotEpisode) {
        this.log.warn(`Pilot episode not found for series ${sonarrSeriesId}`)
        return
      }

      this.log.debug(`Found pilot episode: S01E01 (ID: ${pilotEpisode.id})`)

      // Find all other episodes in Season 1 that have files and need to be deleted
      const episodesToDelete = allEpisodes.filter(
        (ep) =>
          ep.seasonNumber === 1 &&
          ep.id !== pilotEpisode.id &&
          ep.hasFile === true &&
          ep.episodeFileId > 0,
      )

      // Find all other episodes in Season 1 that need to be unmonitored
      const episodesToUnmonitor = allEpisodes
        .filter(
          (ep) =>
            ep.seasonNumber === 1 &&
            ep.id !== pilotEpisode.id &&
            ep.monitored === true,
        )
        .map((ep) => ({ id: ep.id, monitored: false }))

      let deletedCount = 0
      if (episodesToDelete.length > 0) {
        // Delete episode files first
        const episodeFileIds = episodesToDelete.map((ep) => ep.episodeFileId)
        await sonarr.deleteEpisodeFiles(episodeFileIds)
        deletedCount = episodeFileIds.length
      }

      if (episodesToUnmonitor.length > 0) {
        // Then unmonitor all episodes except the pilot
        await sonarr.updateEpisodesMonitoring(episodesToUnmonitor)
      }

      this.log.info(
        `Progressive cleanup: reset Season 1 of ${showTitle} back to pilot-only (deleted ${deletedCount} episode files, unmonitored ${episodesToUnmonitor.length} episodes)`,
      )
    } catch (error) {
      this.log.error(
        `Error resetting Season 1 to pilot-only for ${showTitle}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Cleanup specific seasons for a rolling monitored show
   * Based on the existing season cleanup logic but targeted to specific seasons
   */
  private async cleanupSpecificSeasons(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    showTitle: string,
    seasonsToCleanup: number[],
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getInstance(sonarrInstanceId)
      if (!sonarr) {
        throw new Error(`Sonarr instance ${sonarrInstanceId} not found`)
      }

      // Get all episodes for the series
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      for (const seasonNumber of seasonsToCleanup) {
        // Find episodes in this season that have files and need to be deleted
        const episodesToDelete = allEpisodes.filter(
          (ep) =>
            ep.seasonNumber === seasonNumber &&
            ep.hasFile === true &&
            ep.episodeFileId > 0,
        )

        // Find episodes in this season that need to be unmonitored
        const episodesToUnmonitor = allEpisodes
          .filter(
            (ep) => ep.seasonNumber === seasonNumber && ep.monitored === true,
          )
          .map((ep) => ({ id: ep.id, monitored: false }))

        let deletedCount = 0
        if (episodesToDelete.length > 0) {
          // Delete episode files first
          const episodeFileIds = episodesToDelete.map((ep) => ep.episodeFileId)
          await sonarr.deleteEpisodeFiles(episodeFileIds)
          deletedCount = episodeFileIds.length
        }

        if (episodesToUnmonitor.length > 0) {
          // Then unmonitor all episodes in this season
          await sonarr.updateEpisodesMonitoring(episodesToUnmonitor)
        }

        // Unmonitor the entire season
        await sonarr.updateSeasonMonitoring(sonarrSeriesId, seasonNumber, false)

        this.log.info(
          `Progressive cleanup: removed season ${seasonNumber} of ${showTitle} (deleted ${deletedCount} episode files, unmonitored ${episodesToUnmonitor.length} episodes)`,
        )
      }
    } catch (error) {
      this.log.error({ error }, `Error cleaning up seasons for ${showTitle}:`)
      throw error
    }
  }
}
