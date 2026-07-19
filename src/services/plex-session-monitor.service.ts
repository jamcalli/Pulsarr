/**
 * Plex Session Monitor Service
 *
 * Monitors Plex sessions and triggers Sonarr searches based on viewing patterns
 * Implements "rolling" monitoring for progressive season downloads
 */

import type {
  PlexPlaySessionNotification,
  PlexSession,
  RollingMonitoredShow,
  SessionMonitoringResult,
} from '@root/types/plex-session.types.js'
import type { SonarrSeries } from '@root/types/sonarr.types.js'
import {
  collectSeasonsEligibleForCleanup,
  userNeedsSeason,
} from '@services/plex-session-monitor/cleanup-predicates.js'
import {
  extractPlexKey,
  extractTvdbId,
  normalizeGuid,
  parseGuids,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export class PlexSessionMonitorService {
  private readonly log: FastifyBaseLogger

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_SESSION_MONITOR')
    this.log.info('PlexSessionMonitorService initialized')
  }

  /**
   * Access to application configuration
   */
  private get config() {
    return this.fastify.config
  }

  /**
   * Access to Plex server service
   */
  private get plexServer() {
    return this.fastify.plexServerService
  }

  /**
   * Access to Sonarr manager service
   */
  private get sonarrManager() {
    return this.fastify.sonarrManager
  }

  /**
   * Access to database service
   */
  private get db() {
    return this.fastify.db
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
          this.log.error(
            {
              error,
              seriesTitle: session.grandparentTitle || 'Unknown',
              season: session.parentIndex,
              episode: session.index,
              grandparentKey: session.grandparentKey,
            },
            'Error processing session',
          )
          result.errors.push(
            `Error processing session for ${session.grandparentTitle || 'Unknown'}`,
          )
        }
      }

      this.log.info(
        `Session monitoring complete. Processed: ${result.processedSessions}, Triggered: ${result.triggeredSearches}`,
      )

      return result
    } catch (error) {
      this.log.error({ error }, 'Fatal error in session monitoring')
      result.errors.push('Fatal error in session monitoring')
      return result
    }
  }

  /**
   * Handle SSE playing events for immediate session processing.
   * Only processes meaningful state transitions (new sessions, state changes).
   * Falls back gracefully if the REST hydration call fails.
   */
  async handlePlayingEvent(
    notifications: PlexPlaySessionNotification[],
  ): Promise<void> {
    if (!this.config.plexSessionMonitoring?.enabled) return

    const tracker = this.plexServer.getSessionTracker()
    if (!tracker) return

    for (const notification of notifications) {
      const isTransition = tracker.handlePlayingEvent(notification)
      if (!isTransition) continue

      // Stopped sessions just get removed from tracking, no processing needed
      if (notification.state === 'stopped') continue

      // For new/resumed sessions, hydrate full session data from the REST API
      // so we can reuse the existing processSession logic
      try {
        const sessions = await this.plexServer.getActiveSessions()
        const result: SessionMonitoringResult = {
          processedSessions: 0,
          triggeredSearches: 0,
          errors: [],
          rollingUpdates: [],
        }

        // Match on sessionKey - unique per playback session and present in
        // both the SSE event and the REST session response
        for (const session of sessions) {
          if (session.type !== 'episode') continue

          if (session.sessionKey === notification.sessionKey) {
            await this.processSession(session, result)
            break
          }
        }

        if (result.triggeredSearches > 0) {
          this.log.info(
            {
              ratingKey: notification.ratingKey,
              searches: result.triggeredSearches,
            },
            'SSE playing event triggered search',
          )
        }
      } catch (error) {
        this.log.warn(
          { error, ratingKey: notification.ratingKey },
          'Failed to hydrate session from SSE event - polling will catch it',
        )
      }
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

    // Synced shows have one rolling entry per instance, so process all of them.
    const rollingShows = await this.getRollingMonitoredShows(session)

    if (rollingShows.length === 0) {
      // Skip shows that are not configured for rolling monitoring
      this.log.debug(
        `Skipping ${session.grandparentTitle} - not configured for rolling monitoring for user ${session.User.title}`,
      )
      return
    }

    // Isolate per instance so one failure does not skip the rest.
    for (const rollingShow of rollingShows) {
      try {
        await this.handleRollingMonitoredShow(
          session,
          rollingShow,
          result,
          canTriggerActions,
        )
      } catch (error) {
        this.log.error(
          {
            error,
            showTitle: rollingShow.show_title,
            instanceId: rollingShow.sonarr_instance_id,
          },
          'Error processing rolling monitored show',
        )
        result.errors.push(
          `Error processing rolling monitored show ${rollingShow.show_title} on instance ${rollingShow.sonarr_instance_id}`,
        )
      }
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

    // rollingShow was read pre-write, so last_watched_* are the prior values.
    const positionUnchanged =
      rollingShow.last_watched_season === currentSeason &&
      rollingShow.last_watched_episode === currentEpisode

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

    // Above the positionUnchanged gate so a transient failure retries on repeated E01.
    if (
      rollingShow.monitoring_type === 'allSeasonPilotRolling' &&
      currentEpisode === 1
    ) {
      await this.expandPilotToFullSeason(
        rollingShow,
        session,
        result,
        currentSeason,
      )
      return
    }

    // Special case for pilot rolling: if watching the pilot episode, expand immediately
    if (
      rollingShow.monitoring_type === 'pilotRolling' &&
      currentSeason === 1 &&
      currentEpisode === 1
    ) {
      await this.expandPilotToFullSeason(rollingShow, session, result, 1)
      return
    }

    // allSeasonPilotRolling only expands via pilot watch, not end-of-season threshold
    if (rollingShow.monitoring_type === 'allSeasonPilotRolling') return

    // The next-season check below queries Sonarr, so skip it on no-progress events.
    if (positionUnchanged) return

    // Progress was already persisted above, so a failed check would make every
    // later poll of this episode hit the positionUnchanged gate and never
    // retry. Restore the prior position on failure so the next poll retries.
    const revertProgress = () =>
      this.db.updateRollingShowProgress(
        rollingShow.id,
        rollingShow.last_watched_season,
        rollingShow.last_watched_episode,
      )

    // Read season statistics from this entry's own instance and series.
    const sonarr = this.sonarrManager.getSonarrService(
      rollingShow.sonarr_instance_id,
    )
    if (!sonarr) {
      await revertProgress()
      return
    }

    // Fetch by Sonarr ID: entries enrolled without a TVDB GUID store an
    // empty tvdb_id, and the series ID is always present.
    let series: SonarrSeries | null
    try {
      series = await sonarr.getSeriesById(rollingShow.sonarr_series_id)
    } catch (error) {
      await revertProgress()
      throw error
    }
    if (!series) {
      await revertProgress()
      return
    }

    const season = series.seasons?.find((s) => s.seasonNumber === currentSeason)
    if (!season?.statistics?.totalEpisodeCount) return

    const totalEpisodes = season.statistics.totalEpisodeCount
    const remainingEpisodes = totalEpisodes - currentEpisode
    const threshold = this.config.plexSessionMonitoring?.remainingEpisodes || 2

    if (remainingEpisodes <= threshold && remainingEpisodes >= 0) {
      // User is near the end of the current season
      const hasMoreSeasons = series.seasons?.some(
        (s) => s.seasonNumber > currentSeason,
      )

      if (hasMoreSeasons) {
        // Expand to next season based on what user is watching
        try {
          await this.expandMonitoringToNextSeason(rollingShow, session, result)
        } catch (error) {
          await revertProgress()
          throw error
        }
      }
      // No more seasons - show stays in rolling monitoring.
      // Inactivity reset handles cleanup; no need to delete tracking entries.
    }
  }

  /**
   * Get series identifiers (TVDB ID, etc.) from Plex metadata using robust GUID handling
   */
  private async getSeriesIdentifiers(
    session: PlexSession,
  ): Promise<{ tvdbId?: string; imdbId?: string } | null> {
    try {
      const ratingKey = extractPlexKey(session.grandparentKey)
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
        { identifiers: result },
        `Extracted identifiers for ${session.grandparentTitle}:`,
      )
      return result
    } catch (error) {
      this.log.debug(
        { error },
        `Could not fetch metadata for ${session.grandparentTitle}, will fallback to title matching:`,
      )
      return {} // Return empty object to allow title fallback
    }
  }

  /**
   * Get rolling monitored shows from database for the specific user, one per
   * enrolled Sonarr instance. Handles migration from global to per-user entries.
   */
  private async getRollingMonitoredShows(
    session: PlexSession,
  ): Promise<RollingMonitoredShow[]> {
    try {
      const identifiers = await this.getSeriesIdentifiers(session)
      const tvdbId = identifiers?.tvdbId

      // Master entries (null plex_user_id) define which shows are enrolled.
      const globalShows = await this.db.getRollingMonitoredShowMatches(
        tvdbId,
        session.grandparentTitle,
        undefined,
      )

      if (globalShows.length === 0) {
        return []
      }

      // Key per-user rows by instance+series so each master resolves to its own.
      const userShows = await this.db.getRollingMonitoredShowMatches(
        tvdbId,
        session.grandparentTitle,
        session.User.id,
      )
      const userShowByKey = new Map(
        userShows.map((show) => [
          `${show.sonarr_instance_id}-${show.sonarr_series_id}`,
          show,
        ]),
      )

      const resolved: RollingMonitoredShow[] = []

      for (const globalShow of globalShows) {
        const key = `${globalShow.sonarr_instance_id}-${globalShow.sonarr_series_id}`
        const existing = userShowByKey.get(key)

        if (existing) {
          resolved.push(existing)
          continue
        }

        this.log.info(
          `Creating per-user rolling show entry for ${globalShow.show_title} on instance ${globalShow.sonarr_instance_id} for user ${session.User.title}`,
        )

        try {
          const userEntryId =
            await this.db.createOrFindUserRollingMonitoredShow(
              globalShow,
              session.User.id,
              session.User.title,
            )

          const byId = await this.db.getRollingMonitoredShowById(userEntryId)
          if (!byId) {
            this.log.warn(
              `Per-user entry (ID: ${userEntryId}) not found after createOrFind for ${globalShow.show_title} (${session.User.title})`,
            )
            continue
          }
          resolved.push(byId)
        } catch (error) {
          // Keep entries already resolved on other instances.
          this.log.error(
            {
              error,
              showTitle: globalShow.show_title,
              instanceId: globalShow.sonarr_instance_id,
            },
            'Error resolving per-user rolling show entry',
          )
        }
      }

      return resolved
    } catch (error) {
      this.log.error({ error }, 'Error getting rolling monitored shows:')
      return []
    }
  }

  // Cleanup is gated on season advancement because Plex emits 'playing'
  // every ~10s plus extras on each scrub/pause/resume.
  private async updateRollingShowProgress(
    showId: number,
    season: number,
    episode: number,
    canTriggerActions = true,
  ): Promise<void> {
    try {
      const priorRow = await this.db.getRollingMonitoredShowById(showId)
      const priorSeason = priorRow?.last_watched_season ?? 0

      await this.db.updateRollingShowProgress(showId, season, episode)

      const shouldRunCleanup =
        this.config.plexSessionMonitoring?.enableProgressiveCleanup &&
        canTriggerActions &&
        season > priorSeason

      if (shouldRunCleanup) {
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
    const nextSeason = session.parentIndex + 1

    try {
      const sonarr = this.sonarrManager.getSonarrService(
        rollingShow.sonarr_instance_id,
      )
      if (!sonarr) return

      // Check if next season is already fully monitored - skip if desired state is met
      const allEpisodes = await sonarr.getEpisodes(rollingShow.sonarr_series_id)
      const unmonitoredInNextSeason = allEpisodes.filter(
        (ep) => ep.seasonNumber === nextSeason && !ep.monitored,
      )

      if (unmonitoredInNextSeason.length === 0) {
        this.log.debug(
          `Season ${nextSeason} of ${session.grandparentTitle} already fully monitored, skipping expansion`,
        )
        return
      }

      // Update Sonarr to monitor the next season
      await sonarr.updateSeasonMonitoring(
        rollingShow.sonarr_series_id,
        nextSeason,
        true,
      )

      // Ensure all episodes are monitored (season flag change may not cascade)
      await sonarr.updateEpisodesMonitoring(
        unmonitoredInNextSeason.map((ep) => ({ id: ep.id, monitored: true })),
      )

      await sonarr.searchSeason(rollingShow.sonarr_series_id, nextSeason)

      // Update database only if this is a new high-water mark
      // This prevents regressing when user watches earlier seasons after skipping ahead
      if (nextSeason > rollingShow.current_monitored_season) {
        await this.db.updateRollingShowMonitoredSeason(
          rollingShow.id,
          nextSeason,
        )
      }

      result.rollingUpdates.push({
        showTitle: session.grandparentTitle,
        action: 'expanded_to_next_season',
        details: `Now monitoring up to season ${nextSeason}`,
      })

      result.triggeredSearches++

      this.log.info(
        `Expanded monitoring for ${session.grandparentTitle} from season ${session.parentIndex} to season ${nextSeason}`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Failed to expand monitoring for ${session.grandparentTitle}:`,
      )
      // Rethrow so the caller can restore progress and retry next poll
      throw error
    }
  }

  /**
   * Expand pilot rolling to monitor a full season.
   * Explicitly monitors all episodes first to handle re-expansion after cleanup,
   * since Sonarr only cascades season-to-episode monitoring on flag *changes* -
   * if the season is already marked monitored, unmonitored episodes stay unmonitored.
   * @param seasonNumber The season to expand
   */
  private async expandPilotToFullSeason(
    rollingShow: RollingMonitoredShow,
    session: PlexSession,
    result: SessionMonitoringResult,
    seasonNumber: number,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getSonarrService(
        rollingShow.sonarr_instance_id,
      )
      if (!sonarr) return

      // Explicitly monitor all episodes in the season before searching.
      // Sonarr only cascades season.monitored to episodes when the flag
      // *changes*. After progressive cleanup, the season flag may still be
      // true while individual E02+ are unmonitored.
      const allEpisodes = await sonarr.getEpisodes(rollingShow.sonarr_series_id)
      const unmonitoredInSeason = allEpisodes.filter(
        (ep) => ep.seasonNumber === seasonNumber && !ep.monitored,
      )

      // If all episodes are already monitored, the season is in the desired state - skip
      if (unmonitoredInSeason.length === 0) {
        this.log.debug(
          `Season ${seasonNumber} of ${session.grandparentTitle} already fully monitored, skipping expansion`,
        )
        return
      }

      // Set the season flag so future episodes auto-monitor when added
      await sonarr.updateSeasonMonitoring(
        rollingShow.sonarr_series_id,
        seasonNumber,
        true,
      )

      await sonarr.updateEpisodesMonitoring(
        unmonitoredInSeason.map((ep) => ({ id: ep.id, monitored: true })),
      )

      await sonarr.searchSeason(rollingShow.sonarr_series_id, seasonNumber)

      // Update high-water mark if this season is higher
      if (seasonNumber > rollingShow.current_monitored_season) {
        await this.db.updateRollingShowMonitoredSeason(
          rollingShow.id,
          seasonNumber,
        )
      }

      result.rollingUpdates.push({
        showTitle: session.grandparentTitle,
        action: 'expanded_to_season',
        details: `Pilot viewed - now searching for full Season ${seasonNumber}`,
      })

      result.triggeredSearches++

      this.log.info(
        `Expanded pilot monitoring for ${session.grandparentTitle} to search full Season ${seasonNumber}`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Failed to expand pilot monitoring for ${session.grandparentTitle}:`,
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
    monitoringType:
      | 'pilotRolling'
      | 'firstSeasonRolling'
      | 'allSeasonPilotRolling',
  ): Promise<number> {
    try {
      // allSeasonPilotRolling uses 0 to track full-season expansion (not pilot seeding)
      const initialSeason = monitoringType === 'allSeasonPilotRolling' ? 0 : 1

      return await this.db.createRollingMonitoredShow({
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
   * Monitor E01 of every season for an allSeasonPilotRolling show
   * Called at add-time to seed all pilot episodes
   */
  async monitorAllSeasonPilots(
    seriesId: number,
    instanceId: number,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getSonarrService(instanceId)
      if (!sonarr) {
        throw new Error(`Sonarr instance ${instanceId} not found`)
      }

      // Sonarr queues a background RefreshSeriesCommand after adding a series.
      // That task re-applies the addOptions monitoring preset (e.g. 'none') and
      // clobbers any episode-level changes made before it finishes. Wait for it
      // to complete before touching monitoring.
      await sonarr.waitForAddComplete(seriesId)

      // Ensure series is monitored but don't auto-monitor new seasons
      await sonarr.updateSeriesMonitoring(seriesId, {
        monitored: true,
        monitorNewItems: 'none',
      })

      // Fetch all episodes
      const allEpisodes = await sonarr.getEpisodes(seriesId)

      // Filter to E01 of each real season (skip specials)
      const pilots = allEpisodes.filter(
        (ep) => ep.seasonNumber > 0 && ep.episodeNumber === 1,
      )

      if (pilots.length === 0) {
        this.log.warn(`No pilot episodes found for series ${seriesId}`)
        return
      }

      // Monitor all pilot episodes
      await sonarr.updateEpisodesMonitoring(
        pilots.map((ep) => ({ id: ep.id, monitored: true })),
      )

      // Search for all pilot episodes
      await sonarr.searchEpisodes(pilots.map((ep) => ep.id))

      this.log.info(
        `Seeded ${pilots.length} pilot episodes for series ${seriesId}`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Error seeding pilot episodes for series ${seriesId}:`,
      )
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
      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
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
      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
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
        { error },
        `Error resetting ${showTitle} to first-season-only:`,
      )
      throw error
    }
  }

  /**
   * Reset inactive rolling monitored shows to their original monitoring state
   * Removes all user entries and resets master records to their type's baseline season
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
          } else if (show.monitoring_type === 'allSeasonPilotRolling') {
            await this.resetToAllSeasonPilots(
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
            { error },
            `Failed to reset inactive rolling show ${show.show_title}:`,
          )
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Error resetting inactive rolling shows:')
      throw error
    }
  }

  /**
   * Compute the upper bound for progressive cleanup season checking
   */
  private computeCleanupUpperBound(
    currentSeason: number,
    currentMonitored: number,
  ): number {
    // Never clean >= current monitored; never look beyond the season being watched
    return Math.min(currentSeason, currentMonitored)
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
        `Progressive cleanup check for ${rollingShow.show_title}: currentSeason=${currentSeason}, currentMonitored=${rollingShow.current_monitored_season}, lastWatched=${rollingShow.last_watched_season ?? 'n/a'}`,
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
          show.plex_user_id != null &&
          show.last_session_date != null &&
          new Date(show.last_session_date) >= cutoffDate &&
          // Only consider users that are allowed to trigger monitoring actions
          this.isUserAllowedToTriggerActions(
            show.plex_user_id || '',
            show.plex_username || '',
          ),
      )

      this.log.debug(
        {
          users: allUsersWatchingShow.map((u) => ({
            user: u.plex_username,
            last_watched_season: u.last_watched_season,
            last_watched_episode: u.last_watched_episode,
          })),
        },
        `Progressive cleanup safety check: found ${allUsersWatchingShow.length} active filtered users for ${rollingShow.show_title}`,
      )

      // Determine which seasons to clean up based on monitoring type
      const seasonsToCleanup: number[] = []

      // Determine start season and compute cleanup upper bound per monitoring type
      const startSeason =
        rollingShow.monitoring_type === 'allSeasonPilotRolling' ? 1 : 2
      const maxSeasonToCheck = this.computeCleanupUpperBound(
        currentSeason,
        rollingShow.current_monitored_season,
      )

      this.log.debug(
        `Progressive cleanup range (${rollingShow.monitoring_type}): ` +
          (maxSeasonToCheck <= startSeason
            ? 'no seasons eligible for cleanup'
            : `checking seasons ${startSeason} to ${maxSeasonToCheck - 1} (currentSeason: ${currentSeason}, monitored: ${rollingShow.current_monitored_season})`),
      )

      seasonsToCleanup.push(
        ...collectSeasonsEligibleForCleanup(
          startSeason,
          maxSeasonToCheck,
          allUsersWatchingShow,
        ),
      )

      // pilotRolling: also check if Season 1 needs reset back to pilot-only (when watching S2+)
      if (rollingShow.monitoring_type === 'pilotRolling' && currentSeason > 1) {
        const anyUserWatchingSeason1 = allUsersWatchingShow.some((show) =>
          userNeedsSeason(show, 1),
        )
        this.log.debug(
          `Season 1 pilot reset check - any filtered user watching S1: ${anyUserWatchingSeason1}, currentSeason: ${currentSeason}`,
        )

        if (!anyUserWatchingSeason1) {
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
      }

      // Perform cleanup for safe seasons
      if (seasonsToCleanup.length > 0) {
        this.log.info(
          `Progressive cleanup for ${rollingShow.show_title}: removing seasons ${seasonsToCleanup.join(', ')}`,
        )

        if (rollingShow.monitoring_type === 'allSeasonPilotRolling') {
          // Preserve E01 of each season, remove E02+ files and unmonitor E02+
          await this.cleanupSeasonsPreservePilots(
            rollingShow.sonarr_series_id,
            rollingShow.sonarr_instance_id,
            rollingShow.show_title,
            seasonsToCleanup,
          )
        } else {
          await this.cleanupSpecificSeasons(
            rollingShow.sonarr_series_id,
            rollingShow.sonarr_instance_id,
            rollingShow.show_title,
            seasonsToCleanup,
          )
        }
      }
    } catch (error) {
      this.log.error(
        {
          error,
          showTitle: rollingShow.show_title,
          sonarrSeriesId: rollingShow.sonarr_series_id,
          currentSeason,
          monitoringType: rollingShow.monitoring_type,
        },
        'Error in progressive cleanup - storage cleanup may be incomplete',
      )

      // Don't re-throw - progressive cleanup failures shouldn't break session processing
      // But log with enough context for debugging storage issues
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
      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
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
        { error },
        `Error checking pilot-only state for series ${sonarrSeriesId}:`,
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

      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
      if (!sonarr) {
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
        { error },
        `Error resetting Season 1 to pilot-only for ${showTitle}:`,
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
      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
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

  /**
   * Cleanup seasons while preserving E01 (pilot) of each season
   * For allSeasonPilotRolling: deletes E02+ files, unmonitors E02+, keeps E01 monitored
   */
  private async cleanupSeasonsPreservePilots(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    showTitle: string,
    seasonsToCleanup: number[],
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
      if (!sonarr) {
        throw new Error(`Sonarr instance ${sonarrInstanceId} not found`)
      }

      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      for (const seasonNumber of seasonsToCleanup) {
        const seasonEpisodes = allEpisodes.filter(
          (ep) => ep.seasonNumber === seasonNumber,
        )

        // Find the pilot episode for this season
        const pilotEpisode = seasonEpisodes.find((ep) => ep.episodeNumber === 1)

        // Delete files for E02+ only
        const episodesToDelete = seasonEpisodes.filter(
          (ep) =>
            ep.episodeNumber > 1 && ep.hasFile === true && ep.episodeFileId > 0,
        )

        // Unmonitor E02+ only
        const episodesToUnmonitor = seasonEpisodes
          .filter((ep) => ep.episodeNumber > 1 && ep.monitored === true)
          .map((ep) => ({ id: ep.id, monitored: false }))

        let deletedCount = 0
        if (episodesToDelete.length > 0) {
          const episodeFileIds = episodesToDelete.map((ep) => ep.episodeFileId)
          await sonarr.deleteEpisodeFiles(episodeFileIds)
          deletedCount = episodeFileIds.length
        }

        if (episodesToUnmonitor.length > 0) {
          await sonarr.updateEpisodesMonitoring(episodesToUnmonitor)
        }

        // Ensure the pilot stays monitored
        if (pilotEpisode && !pilotEpisode.monitored) {
          await sonarr.updateEpisodesMonitoring([
            { id: pilotEpisode.id, monitored: true },
          ])
        }

        this.log.info(
          `Progressive cleanup: reset season ${seasonNumber} of ${showTitle} to pilot-only (deleted ${deletedCount} episode files, unmonitored ${episodesToUnmonitor.length} episodes)`,
        )
      }
    } catch (error) {
      this.log.error(
        { error },
        `Error cleaning up seasons (preserve pilots) for ${showTitle}:`,
      )
      throw error
    }
  }

  /**
   * Reset an allSeasonPilotRolling show to its initial state
   * Deletes all non-pilot episode files, unmonitors non-pilots, ensures all pilots are monitored
   */
  async resetToAllSeasonPilots(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    showTitle: string,
  ): Promise<void> {
    try {
      const sonarr = this.sonarrManager.getSonarrService(sonarrInstanceId)
      if (!sonarr) {
        throw new Error(`Sonarr instance ${sonarrInstanceId} not found`)
      }

      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      // Build set of pilot episode IDs (E01 of each real season)
      const pilotIds = new Set(
        allEpisodes
          .filter((ep) => ep.seasonNumber > 0 && ep.episodeNumber === 1)
          .map((ep) => ep.id),
      )

      // Delete all non-pilot episode files
      const episodesToDelete = allEpisodes.filter(
        (ep) =>
          !pilotIds.has(ep.id) && ep.hasFile === true && ep.episodeFileId > 0,
      )

      // Unmonitor all non-pilot episodes
      const episodesToUnmonitor = allEpisodes
        .filter((ep) => !pilotIds.has(ep.id) && ep.monitored === true)
        .map((ep) => ({ id: ep.id, monitored: false }))

      let deletedCount = 0
      if (episodesToDelete.length > 0) {
        const episodeFileIds = episodesToDelete.map((ep) => ep.episodeFileId)
        await sonarr.deleteEpisodeFiles(episodeFileIds)
        deletedCount = episodeFileIds.length
      }

      if (episodesToUnmonitor.length > 0) {
        await sonarr.updateEpisodesMonitoring(episodesToUnmonitor)
      }

      // Unmonitor all seasons so Sonarr doesn't auto-monitor future episodes
      const seasonNumbers = new Set(
        allEpisodes
          .filter((ep) => ep.seasonNumber > 0)
          .map((ep) => ep.seasonNumber),
      )
      for (const seasonNumber of seasonNumbers) {
        await sonarr.updateSeasonMonitoring(sonarrSeriesId, seasonNumber, false)
      }

      // Ensure all pilots are monitored
      const pilotsToMonitor = allEpisodes
        .filter((ep) => pilotIds.has(ep.id) && !ep.monitored)
        .map((ep) => ({ id: ep.id, monitored: true }))

      if (pilotsToMonitor.length > 0) {
        await sonarr.updateEpisodesMonitoring(pilotsToMonitor)
      }

      this.log.info(
        `Reset ${showTitle} to all-season-pilots: deleted ${deletedCount} episode files, unmonitored ${episodesToUnmonitor.length} episodes, ensured ${pilotIds.size} pilots monitored`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Error resetting ${showTitle} to all-season-pilots:`,
      )
      throw error
    }
  }

  /**
   * Sync new season pilots for all allSeasonPilotRolling shows
   * Finds unmonitored E01s (from newly added seasons) and monitors/searches them
   */
  async syncNewSeasonPilots(): Promise<void> {
    try {
      const allShows = await this.db.getRollingMonitoredShows()

      // Only master records (no plex_user_id) with allSeasonPilotRolling type
      const masterShows = allShows.filter(
        (show) =>
          show.monitoring_type === 'allSeasonPilotRolling' &&
          show.plex_user_id == null,
      )

      if (masterShows.length === 0) {
        this.log.debug('No allSeasonPilotRolling shows to sync')
        return
      }

      this.log.info(`Syncing new season pilots for ${masterShows.length} shows`)

      for (const show of masterShows) {
        try {
          const sonarr = this.sonarrManager.getSonarrService(
            show.sonarr_instance_id,
          )
          if (!sonarr) continue

          const allEpisodes = await sonarr.getEpisodes(show.sonarr_series_id)

          // Find unmonitored E01s of real seasons (new seasons added since last sync)
          const unmonitoredPilots = allEpisodes.filter(
            (ep) =>
              ep.seasonNumber > 0 && ep.episodeNumber === 1 && !ep.monitored,
          )

          if (unmonitoredPilots.length === 0) continue

          // Monitor the new pilots
          await sonarr.updateEpisodesMonitoring(
            unmonitoredPilots.map((ep) => ({ id: ep.id, monitored: true })),
          )

          // Search for the new pilots
          await sonarr.searchEpisodes(unmonitoredPilots.map((ep) => ep.id))

          this.log.info(
            `Synced ${unmonitoredPilots.length} new season pilots for ${show.show_title}`,
          )
        } catch (error) {
          this.log.error(
            { error },
            `Failed to sync new season pilots for ${show.show_title}:`,
          )
        }
      }
    } catch (error) {
      this.log.error({ error }, 'Error syncing new season pilots:')
      throw error
    }
  }
}
