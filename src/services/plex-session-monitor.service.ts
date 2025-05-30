/**
 * Plex Session Monitor Service
 *
 * Monitors Plex sessions and triggers Sonarr searches based on viewing patterns
 * Implements "rolling" monitoring for progressive season downloads
 */
import type { FastifyBaseLogger } from 'fastify'
import type { PlexServerService } from '@utils/plex-server.js'
import type { SonarrManagerService } from './sonarr-manager.service.js'
import type { DatabaseService } from './database.service.js'
import type { Config } from '@root/types/config.types.js'
import type { SonarrSeries } from '@root/types/sonarr.types.js'
import type {
  PlexSession,
  RollingMonitoredShow,
  SessionMonitoringResult,
} from '@root/types/plex-session.types.js'
import { extractTvdbId, parseGuids } from '@utils/guid-handler.js'

/**
 * Simple in-memory deduplication tracker
 */
interface SeenEntry {
  series: string // TVDB ID or series title
  season: number
  timestamp: Date
}

export class PlexSessionMonitorService {
  private seenEntries = new Map<string, SeenEntry>()
  private readonly SEEN_EXPIRY_DAYS = 7

  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly config: Config,
    private readonly plexServer: PlexServerService,
    private readonly sonarrManager: SonarrManagerService,
    private readonly db: DatabaseService,
  ) {
    this.log.info('PlexSessionMonitorService initialized')
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
      // Clean up old seen entries
      this.cleanupSeenEntries()

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

    // Check user filter if configured
    if (
      this.config.plexSessionMonitoring?.filterUsers &&
      this.config.plexSessionMonitoring.filterUsers.length > 0
    ) {
      const allowedUsers = this.config.plexSessionMonitoring.filterUsers
      if (
        !allowedUsers.includes(session.User.id) &&
        !allowedUsers.includes(session.User.title)
      ) {
        this.log.debug(
          `Skipping session for user ${session.User.title} - not in filter list`,
        )
        return
      }
    }

    result.processedSessions++

    const episodeInfo = `${session.grandparentTitle} S${String(session.parentIndex).padStart(2, '0')}E${String(session.index).padStart(2, '0')}`
    this.log.info(
      `Processing session: ${episodeInfo} watched by ${session.User.title}`,
    )

    // Check if this is a rolling monitored show
    const rollingShow = await this.getRollingMonitoredShow(session)

    if (rollingShow) {
      await this.handleRollingMonitoredShow(session, rollingShow, result)
    } else {
      // Standard monitoring logic (non-rolling)
      await this.handleStandardMonitoring(session, result)
    }
  }

  /**
   * Handle rolling monitored shows
   */
  private async handleRollingMonitoredShow(
    session: PlexSession,
    rollingShow: RollingMonitoredShow,
    result: SessionMonitoringResult,
  ): Promise<void> {
    const currentSeason = session.parentIndex
    const currentEpisode = session.index

    // Update last watched info
    await this.updateRollingShowProgress(
      rollingShow.id,
      currentSeason,
      currentEpisode,
    )

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
   * Handle standard (non-rolling) monitoring
   */
  private async handleStandardMonitoring(
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    // Get series identifiers (may be empty object for title fallback)
    const seriesIds = await this.getSeriesIdentifiers(session)
    if (!seriesIds) {
      this.log.error(
        `Failed to get any identifiers for ${session.grandparentTitle}`,
      )
      return
    }

    // Find series in Sonarr - will use TVDB/IMDB if available, otherwise title
    this.log.debug(
      `Looking for series in Sonarr: ${session.grandparentTitle}`,
      seriesIds,
    )
    const sonarrSeries = await this.findSeriesInSonarr(
      seriesIds,
      session.grandparentTitle,
    )
    if (!sonarrSeries) {
      this.log.warn(
        `Series ${session.grandparentTitle} not found in any Sonarr instance`,
      )
      return
    }
    this.log.debug(
      `Found series in Sonarr instance ${sonarrSeries.instanceId}: ${sonarrSeries.series.title}`,
    )

    // Check if we should trigger a search using Sonarr data
    const shouldTrigger = await this.shouldTriggerSearch(session, sonarrSeries)
    if (!shouldTrigger) {
      return
    }

    // Check deduplication
    const seenKey = `${seriesIds.tvdbId || session.grandparentTitle}_${session.parentIndex + 1}`
    if (this.hasSeenRecently(seenKey)) {
      this.log.debug(
        `Already processed ${session.grandparentTitle} season ${session.parentIndex + 1} recently`,
      )
      return
    }

    // Trigger appropriate action
    if (await this.isStandalonePilot(session, sonarrSeries)) {
      await this.handleStandalonePilot(sonarrSeries, session, result)
    } else {
      await this.handleEndOfSeason(sonarrSeries, session, result)
    }

    // Mark as seen
    this.markAsSeen(seenKey, session.parentIndex + 1)
  }

  /**
   * Determine if we should trigger a search based on episode position using Sonarr data
   */
  private async shouldTriggerSearch(
    session: PlexSession,
    sonarrData: { series: SonarrSeries; instanceId: number },
  ): Promise<boolean> {
    const threshold = this.config.plexSessionMonitoring?.remainingEpisodes || 2

    this.log.debug(
      `Checking trigger conditions for ${session.grandparentTitle} S${session.parentIndex}E${session.index}, threshold: ${threshold}`,
    )

    // Check for standalone pilot using Sonarr data
    if (session.parentIndex === 1 && session.index === 1) {
      const season1 = sonarrData.series.seasons?.find(
        (s) => s.seasonNumber === 1,
      )
      if (season1?.statistics?.episodeFileCount === 1) {
        this.log.info(
          `Detected standalone pilot for ${session.grandparentTitle} (only 1 episode file in Sonarr)`,
        )
        return true
      }
    }

    // Check for end of season using Sonarr data
    const currentSeason = sonarrData.series.seasons?.find(
      (s) => s.seasonNumber === session.parentIndex,
    )
    if (!currentSeason?.statistics) {
      this.log.warn(
        `No season statistics found in Sonarr for ${session.grandparentTitle} season ${session.parentIndex}`,
      )
      return false
    }

    const totalEpisodes = currentSeason.statistics.totalEpisodeCount
    if (!totalEpisodes || totalEpisodes <= 0) {
      this.log.warn(
        `Invalid episode count in Sonarr for ${session.grandparentTitle} season ${session.parentIndex}: ${totalEpisodes}`,
      )
      return false
    }

    // Check if current episode is near the end of season: current_episode > (total_episodes - remaining_threshold)
    const isEndOfSeason = session.index > totalEpisodes - threshold

    this.log.debug(
      `Episode count from Sonarr: ${totalEpisodes}, current episode: ${session.index}`,
    )
    this.log.debug(
      `End of season check: ${session.index} > (${totalEpisodes} - ${threshold}) = ${session.index} > ${totalEpisodes - threshold} = ${isEndOfSeason}`,
    )

    if (isEndOfSeason) {
      this.log.info(
        `User watching near end of season for ${session.grandparentTitle} (episode ${session.index} of ${totalEpisodes})`,
      )
      return true
    }

    this.log.debug(
      `Search not triggered for ${session.grandparentTitle} - not near end of season`,
    )
    return false
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
      const metadata = await this.plexServer.getShowMetadata(ratingKey, false)
      if (!metadata?.MediaContainer?.Guid) {
        this.log.debug(
          `No Guid array found for ${session.grandparentTitle}, will fallback to title matching`,
        )
        return {} // Return empty object to allow title fallback
      }

      // Extract all available GUIDs using robust parsing
      const allGuids: string[] = []

      // Add main GUID if available
      if (metadata.MediaContainer.guid) {
        allGuids.push(metadata.MediaContainer.guid)
      }

      // Add additional GUIDs from Guid array
      if (Array.isArray(metadata.MediaContainer.Guid)) {
        for (const guidObj of metadata.MediaContainer.Guid) {
          if (guidObj.id) {
            allGuids.push(guidObj.id)
          }
        }
      }

      // Use the robust GUID handler to extract TVDB ID
      const tvdbId = extractTvdbId(allGuids)

      const result: { tvdbId?: string; imdbId?: string } = {}
      if (tvdbId > 0) {
        result.tvdbId = tvdbId.toString()
      }

      // For IMDB, look for imdb:// or tt prefixed IDs in the GUID list
      const parsedGuids = parseGuids(allGuids)
      for (const guid of parsedGuids) {
        if (guid.startsWith('imdb://') || guid.startsWith('tt')) {
          const imdbId = guid.replace('imdb://', '').replace(/^tt/, 'tt')
          if (imdbId.startsWith('tt') && imdbId.length > 2) {
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

    for (const instance of instances) {
      try {
        const sonarr = this.sonarrManager.getInstance(instance.id)
        if (!sonarr) continue

        const allSeries = await sonarr.getAllSeries()

        // Try to match by TVDB ID first
        if (identifiers.tvdbId) {
          const tvdbId = identifiers.tvdbId
          const series = allSeries.find(
            (s) => s.tvdbId === Number.parseInt(tvdbId, 10),
          )
          if (series) {
            return { series, instanceId: instance.id }
          }
        }

        // Try IMDB ID
        if (identifiers.imdbId) {
          const series = allSeries.find((s) => s.imdbId === identifiers.imdbId)
          if (series) {
            return { series, instanceId: instance.id }
          }
        }

        // Fallback to title match
        const series = allSeries.find(
          (s) => s.title.toLowerCase() === title.toLowerCase(),
        )
        if (series) {
          return { series, instanceId: instance.id }
        }
      } catch (error) {
        this.log.error(`Error searching Sonarr instance ${instance.id}:`, error)
      }
    }

    return null
  }

  /**
   * Check if this is a standalone pilot episode
   */
  private async isStandalonePilot(
    session: PlexSession,
    sonarrData: { series: SonarrSeries; instanceId: number },
  ): Promise<boolean> {
    if (session.parentIndex !== 1 || session.index !== 1) {
      return false
    }

    // Check Sonarr season statistics
    const season1 = sonarrData.series.seasons?.find((s) => s.seasonNumber === 1)

    if (!season1?.statistics) {
      return false
    }

    // Standalone pilot = only 1 episode file exists
    return season1.statistics.episodeFileCount === 1
  }

  /**
   * Handle standalone pilot episode
   */
  private async handleStandalonePilot(
    sonarrData: { series: SonarrSeries; instanceId: number },
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    this.log.info(
      `Searching for remaining Season 1 episodes of ${session.grandparentTitle}`,
    )

    try {
      const sonarr = this.sonarrManager.getInstance(sonarrData.instanceId)
      if (!sonarr) return

      // Search for missing episodes in season 1
      await sonarr.searchSeason(sonarrData.series.id, 1)

      result.triggeredSearches++
      this.log.info(
        `Successfully triggered search for ${session.grandparentTitle} Season 1`,
      )
    } catch (error) {
      this.log.error(
        `Failed to search for ${session.grandparentTitle} Season 1:`,
        error,
      )
    }
  }

  /**
   * Handle end of season scenario
   */
  private async handleEndOfSeason(
    sonarrData: { series: SonarrSeries; instanceId: number },
    session: PlexSession,
    result: SessionMonitoringResult,
  ): Promise<void> {
    const nextSeason = session.parentIndex + 1

    this.log.info(
      `Checking for Season ${nextSeason} of ${session.grandparentTitle}`,
    )

    try {
      const sonarr = this.sonarrManager.getInstance(sonarrData.instanceId)
      if (!sonarr) return

      // Check if next season exists in Sonarr
      const hasNextSeason = sonarrData.series.seasons?.some(
        (s) => s.seasonNumber === nextSeason,
      )

      if (hasNextSeason) {
        // Search for next season
        await sonarr.searchSeason(sonarrData.series.id, nextSeason)
        result.triggeredSearches++

        this.log.info(
          `Successfully triggered search for ${session.grandparentTitle} Season ${nextSeason}`,
        )
      } else {
        // Enable monitoring for new seasons
        await sonarr.updateSeriesMonitoring(sonarrData.series.id, {
          monitored: true,
          monitorNewItems: 'all',
        })

        this.log.info(
          `Enabled monitoring for new seasons of ${session.grandparentTitle}`,
        )
      }
    } catch (error) {
      this.log.error(
        `Failed to handle end of season for ${session.grandparentTitle}:`,
        error,
      )
    }
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
      this.log.error('Error getting Sonarr series data:', error)
      return null
    }
  }

  /**
   * Get rolling monitored show from database
   */
  private async getRollingMonitoredShow(
    session: PlexSession,
  ): Promise<RollingMonitoredShow | null> {
    try {
      const identifiers = await this.getSeriesIdentifiers(session)
      const tvdbId = identifiers?.tvdbId

      const rollingShow = await this.db.getRollingMonitoredShow(
        tvdbId,
        session.grandparentTitle,
      )

      return rollingShow
    } catch (error) {
      this.log.error('Error getting rolling monitored show:', error)
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
  ): Promise<void> {
    try {
      await this.db.updateRollingShowProgress(showId, season, episode)
    } catch (error) {
      this.log.error('Error updating rolling show progress:', error)
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
   * Clean up old seen entries
   */
  private cleanupSeenEntries(): void {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.SEEN_EXPIRY_DAYS)

    for (const [key, entry] of this.seenEntries.entries()) {
      if (entry.timestamp < cutoffDate) {
        this.seenEntries.delete(key)
      }
    }
  }

  /**
   * Check if we've seen this series/season recently
   */
  private hasSeenRecently(key: string): boolean {
    const entry = this.seenEntries.get(key)
    if (!entry) return false

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.SEEN_EXPIRY_DAYS)

    return entry.timestamp > cutoffDate
  }

  /**
   * Mark a series/season as seen
   */
  private markAsSeen(seriesKey: string, season: number): void {
    this.seenEntries.set(seriesKey, {
      series: seriesKey,
      season,
      timestamp: new Date(),
    })
  }

  /**
   * Create a rolling monitored show entry
   */
  async createRollingMonitoredShow(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    tvdbId: string,
    showTitle: string,
    monitoringType: 'pilot_rolling' | 'first_season_rolling',
  ): Promise<void> {
    try {
      const initialSeason = monitoringType === 'pilot_rolling' ? 1 : 1

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

      this.log.info(
        `Created rolling monitoring entry for ${showTitle} with ${monitoringType}`,
      )
    } catch (error) {
      this.log.error('Error creating rolling monitored show:', error)
      throw error
    }
  }
}
