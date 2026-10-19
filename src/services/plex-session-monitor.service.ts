import { PLEX_SESSION_MONITORING_DEFAULTS } from '@root/schemas/session-monitoring/session-monitoring-config.schema.js'
import {
  ROLLING_BASELINE_SEASON,
  type SonarrRollingMonitorOption,
} from '@root/schemas/sonarr/season-monitoring.schema.js'
import type {
  PlexPlaySessionNotification,
  PlexSession,
  RollingMonitoredShow,
  SessionMonitoringResult,
} from '@root/types/plex-session.types.js'
import type { SonarrEpisode, SonarrSeries } from '@root/types/sonarr.types.js'
import {
  collectSeasonsEligibleForCleanup,
  userNeedsSeason,
} from '@services/plex-session-monitor/cleanup-predicates.js'
import { EpisodeNotices } from '@services/plex-session-monitor/episode-notices.js'
import {
  type AllowedUserMatcher,
  allowAllUsers,
  buildAllowedUserMatcher,
} from '@services/plex-session-monitor/user-filter.js'
import type { SonarrService } from '@services/sonarr.service.js'
import { episodeCode } from '@utils/episode-code.js'
import {
  collectGuidsFromMetadata,
  extractPlexKey,
  extractTvdbId,
} from '@utils/guid-handler.js'
import { createServiceLogger } from '@utils/logger.js'
import { extractUuidFromThumb } from '@utils/plex-avatar.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

type RollingShowTarget = Pick<
  RollingMonitoredShow,
  'monitoring_type' | 'sonarr_series_id' | 'sonarr_instance_id' | 'show_title'
>

type RollingUpdate = Omit<
  SessionMonitoringResult['rollingUpdates'][number],
  'showTitle'
>

function isSeasonPilot(episode: SonarrEpisode): boolean {
  return episode.seasonNumber > 0 && episode.episodeNumber === 1
}

const BASELINE_PLANS: Record<
  SonarrRollingMonitorOption,
  {
    label: string
    keeps: (episode: SonarrEpisode) => boolean
    requiresKept: boolean
    monitorsKept: boolean
  }
> = {
  pilotRolling: {
    label: 'pilot-only',
    keeps: (ep) => ep.seasonNumber === 1 && ep.episodeNumber === 1,
    requiresKept: true,
    monitorsKept: false,
  },
  firstSeasonRolling: {
    label: 'first-season-only',
    keeps: (ep) => ep.seasonNumber <= 1,
    requiresKept: false,
    monitorsKept: false,
  },
  allSeasonPilotRolling: {
    label: 'all-season-pilots',
    keeps: isSeasonPilot,
    requiresKept: false,
    monitorsKept: true,
  },
}

function emptyResult(): SessionMonitoringResult {
  return {
    processedSessions: 0,
    triggeredSearches: 0,
    errors: [],
    rollingUpdates: [],
  }
}

function describeViewing(showTitle: string, session: PlexSession): string {
  return `${showTitle} ${episodeCode(session.parentIndex, session.index)} watched by ${session.User.title}`
}

export class PlexSessionMonitorService {
  private readonly log: FastifyBaseLogger
  private readonly notices = new EpisodeNotices()

  constructor(
    readonly baseLog: FastifyBaseLogger,
    private readonly fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'PLEX_SESSION_MONITOR')
    this.log.info('PlexSessionMonitorService initialized')
  }

  private get config() {
    return this.fastify.config
  }

  private get plexServer() {
    return this.fastify.plexServerService
  }

  private get sonarrManager() {
    return this.fastify.sonarrManager
  }

  private get db() {
    return this.fastify.db
  }

  // Retries and repeated polls reach the same notice, so only its first occurrence per episode logs above debug.
  private notice(level: 'info' | 'warn', key: string, message: string): void {
    this.log[this.notices.isNew(key, message) ? level : 'debug'](message)
  }

  private requireSonarr(instanceId: number): SonarrService {
    const sonarr = this.sonarrManager.getSonarrService(instanceId)
    if (!sonarr) {
      throw new Error(`Sonarr instance ${instanceId} not found`)
    }
    return sonarr
  }

  async monitorSessions(): Promise<SessionMonitoringResult> {
    const result = emptyResult()

    try {
      const sessions = await this.plexServer.getActiveSessions()

      if (sessions.length === 0) {
        this.log.debug('No active Plex sessions found')
        return result
      }

      this.log.debug(`Found ${sessions.length} active Plex sessions`)

      const isUserAllowed = await this.getAllowedUserMatcher()

      for (const session of sessions) {
        try {
          await this.processSession(session, result, isUserAllowed)
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

      this.log.debug(
        `Session monitoring complete. Processed: ${result.processedSessions}, Triggered: ${result.triggeredSearches}`,
      )

      return result
    } catch (error) {
      this.log.error({ error }, 'Fatal error in session monitoring')
      result.errors.push('Fatal error in session monitoring')
      return result
    }
  }

  /** Processes only sessions the tracker reports as newly started or changed media. */
  async handlePlayingEvent(
    notifications: PlexPlaySessionNotification[],
  ): Promise<void> {
    if (!this.config.plexSessionMonitoring?.enabled) return

    const tracker = this.plexServer.getSessionTracker()
    if (!tracker) return

    const transitions = notifications.filter((notification) =>
      tracker.handlePlayingEvent(notification),
    )

    if (transitions.length === 0) return

    const forgetTransitions = () => {
      for (const notification of transitions) {
        tracker.forget(notification.sessionKey)
      }
    }

    let isUserAllowed: AllowedUserMatcher
    try {
      isUserAllowed = await this.getAllowedUserMatcher()
    } catch (error) {
      this.log.warn(
        { error },
        'Failed to resolve user filter for SSE event - will retry on the next event',
      )
      forgetTransitions()
      return
    }

    let sessions: PlexSession[]
    try {
      sessions = await this.plexServer.getActiveSessions()
    } catch (error) {
      this.log.warn(
        { error },
        'Failed to hydrate session from SSE event - will retry on the next event',
      )
      forgetTransitions()
      return
    }

    for (const notification of transitions) {
      const result = emptyResult()

      // The REST list can lag the event by one item, so a sessionKey match on the old ratingKey is not this playback yet
      const session = sessions.find(
        (candidate) =>
          candidate.sessionKey === notification.sessionKey &&
          candidate.ratingKey === notification.ratingKey,
      )
      if (!session) {
        this.log.debug(
          `Not processing SSE event for session ${notification.sessionKey} item ${notification.ratingKey}: Plex does not list it as active yet, will retry on the next event`,
        )
        tracker.forget(notification.sessionKey)
        continue
      }

      try {
        const checkFailed = await this.processSession(
          session,
          result,
          isUserAllowed,
        )
        if (checkFailed) tracker.retryLater(notification.sessionKey)
      } catch (error) {
        tracker.forget(notification.sessionKey)
        this.log.warn(
          { error, ratingKey: notification.ratingKey },
          'Failed to process session from SSE event - will retry on the next event',
        )
        continue
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
    }
  }

  // filterUsers holds Pulsarr user ids, looked up so the viewer's plex.tv uuid and username can be compared
  private async getAllowedUserMatcher(): Promise<AllowedUserMatcher> {
    const filterUsers = this.config.plexSessionMonitoring?.filterUsers
    if (!filterUsers || filterUsers.length === 0) return allowAllUsers

    const userIds = filterUsers
      .filter((value) => /^\d+$/.test(value))
      .map(Number)
    const users = userIds.length > 0 ? await this.db.getUsersByIds(userIds) : []

    return buildAllowedUserMatcher(filterUsers, users)
  }

  /** True when a rolling show check failed and should run again. */
  private async processSession(
    session: PlexSession,
    result: SessionMonitoringResult,
    isUserAllowed: AllowedUserMatcher,
  ): Promise<boolean> {
    if (session.type !== 'episode') {
      return false
    }

    const canTriggerActions = isUserAllowed(
      session.User.id,
      session.User.title,
      extractUuidFromThumb(session.User.thumb),
    )

    result.processedSessions++

    this.log.debug(
      `Processing session: ${session.grandparentTitle} ${episodeCode(session.parentIndex, session.index)} watched by ${session.User.title} (session ${session.sessionKey}, item ${session.ratingKey})`,
    )

    // Synced shows have one rolling entry per instance, so process all of them.
    const rollingShows = await this.getRollingMonitoredShows(session)

    if (rollingShows.length === 0) {
      this.log.debug(
        `Not monitoring ${describeViewing(session.grandparentTitle, session)}: show is not enrolled in rolling monitoring`,
      )
      return false
    }

    let checkFailed = false
    // Isolate per instance so one failure does not skip the rest.
    for (const rollingShow of rollingShows) {
      try {
        const showCheckFailed = await this.handleRollingMonitoredShow(
          session,
          rollingShow,
          result,
          canTriggerActions,
        )
        checkFailed ||= showCheckFailed
      } catch (error) {
        checkFailed = true
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
    return checkFailed
  }

  /** True when the check failed and reverted progress so it can run again. */
  private async handleRollingMonitoredShow(
    session: PlexSession,
    rollingShow: RollingMonitoredShow,
    result: SessionMonitoringResult,
    canTriggerActions: boolean,
  ): Promise<boolean> {
    const currentSeason = session.parentIndex
    const currentEpisode = session.index
    const viewing = describeViewing(rollingShow.show_title, session)
    const noticeKey = String(rollingShow.id)

    // rollingShow was read pre-write, so last_watched_* are the prior values.
    const positionUnchanged =
      rollingShow.last_watched_season === currentSeason &&
      rollingShow.last_watched_episode === currentEpisode

    if (!canTriggerActions) {
      // The stored position is the trigger dedup gate, so a filtered viewing only refreshes activity timestamps.
      await this.updateRollingShowProgress(
        rollingShow,
        rollingShow.last_watched_season,
        rollingShow.last_watched_episode,
        false,
      )
      this.log.debug(
        `Not acting on ${viewing}: viewer is not in the user filter, refreshed activity without recording position`,
      )
      return false
    }

    await this.updateRollingShowProgress(
      rollingShow,
      currentSeason,
      currentEpisode,
      true,
    )

    // Above the positionUnchanged gate so a transient failure retries on repeated E01.
    if (
      rollingShow.monitoring_type === 'allSeasonPilotRolling' &&
      currentEpisode === 1
    ) {
      return this.expandPilotToFullSeason(
        rollingShow,
        session,
        result,
        currentSeason,
      )
    }

    if (
      rollingShow.monitoring_type === 'pilotRolling' &&
      currentSeason === 1 &&
      currentEpisode === 1
    ) {
      return this.expandPilotToFullSeason(rollingShow, session, result, 1)
    }

    if (rollingShow.monitoring_type === 'allSeasonPilotRolling') {
      this.log.debug(
        `Not expanding ${viewing}: allSeasonPilotRolling only expands when an E01 is watched`,
      )
      return false
    }

    // The next-season check below queries Sonarr, so skip it on no-progress events.
    if (positionUnchanged) {
      this.log.debug(
        `Not expanding ${viewing}: position unchanged since the last event`,
      )
      return false
    }

    // Progress is already persisted, so a failed check restores it or the positionUnchanged gate blocks every retry.
    const revertProgress = () =>
      this.db.updateRollingShowProgress(
        rollingShow.id,
        rollingShow.last_watched_season,
        rollingShow.last_watched_episode,
      )

    const sonarr = this.sonarrManager.getSonarrService(
      rollingShow.sonarr_instance_id,
    )
    if (!sonarr) {
      this.notice(
        'warn',
        noticeKey,
        `Not expanding ${viewing}: Sonarr instance ${rollingShow.sonarr_instance_id} not found, reverting progress to retry next poll`,
      )
      await revertProgress()
      return true
    }

    // Entries enrolled without a TVDB GUID store an empty tvdb_id, so fetch by Sonarr id.
    let series: SonarrSeries | null
    try {
      series = await sonarr.getSeriesById(rollingShow.sonarr_series_id)
    } catch (error) {
      await revertProgress()
      throw error
    }
    if (!series) {
      this.notice(
        'warn',
        noticeKey,
        `Not expanding ${viewing}: series ${rollingShow.sonarr_series_id} no longer exists in Sonarr instance ${rollingShow.sonarr_instance_id}`,
      )
      return false
    }

    const season = series.seasons?.find((s) => s.seasonNumber === currentSeason)
    if (!season?.statistics?.totalEpisodeCount) {
      this.notice(
        'info',
        noticeKey,
        `Not expanding ${viewing}: Sonarr has no episode statistics for ${episodeCode(currentSeason)}, reverting progress to retry next poll`,
      )
      await revertProgress()
      return true
    }

    const totalEpisodes = season.statistics.totalEpisodeCount
    const remainingEpisodes = totalEpisodes - currentEpisode
    const threshold =
      this.config.plexSessionMonitoring?.remainingEpisodes ??
      PLEX_SESSION_MONITORING_DEFAULTS.remainingEpisodes

    if (remainingEpisodes < 0) {
      this.notice(
        'info',
        noticeKey,
        `Not expanding ${viewing}: Sonarr counts only ${totalEpisodes} episodes in ${episodeCode(currentSeason)}`,
      )
      return false
    }

    if (remainingEpisodes > threshold) {
      this.log.debug(
        `Not expanding ${viewing}: ${remainingEpisodes} of ${totalEpisodes} episodes remain in ${episodeCode(currentSeason)}, threshold is ${threshold}`,
      )
      return false
    }

    const nextSeason = currentSeason + 1
    if (!series.seasons?.some((s) => s.seasonNumber === nextSeason)) {
      this.notice(
        'info',
        noticeKey,
        `Not expanding ${viewing}: Sonarr lists no ${episodeCode(nextSeason)} after ${episodeCode(currentSeason)}`,
      )
      return false
    }

    try {
      await this.monitorAndSearchSeason(
        sonarr,
        rollingShow,
        session,
        result,
        nextSeason,
        {
          action: 'expanded_to_next_season',
          details: `Now monitoring up to season ${nextSeason}`,
        },
        `Expanded monitoring for ${session.grandparentTitle} from season ${currentSeason} to season ${nextSeason}`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Failed to expand monitoring for ${session.grandparentTitle}:`,
      )
      await revertProgress()
      throw error
    }
    return false
  }

  private async getSeriesTvdbId(
    session: PlexSession,
  ): Promise<string | undefined> {
    try {
      const ratingKey = extractPlexKey(session.grandparentKey)
      if (!ratingKey) {
        this.log.debug(
          `No rating key found for ${session.grandparentTitle}, will fallback to title matching`,
        )
        return undefined
      }

      const metadata = await this.plexServer.getShowMetadata(ratingKey, false)

      const metadataItem = metadata?.MediaContainer?.Metadata?.[0]
      if (!metadataItem) {
        this.log.debug(
          `No metadata found for ${session.grandparentTitle}, will fallback to title matching`,
        )
        return undefined
      }

      const tvdbId = extractTvdbId(collectGuidsFromMetadata(metadataItem))
      const result = tvdbId > 0 ? tvdbId.toString() : undefined

      this.log.debug(
        { tvdbId: result },
        `Extracted identifiers for ${session.grandparentTitle}:`,
      )
      return result
    } catch (error) {
      this.log.debug(
        { error },
        `Could not fetch metadata for ${session.grandparentTitle}, will fallback to title matching:`,
      )
      return undefined
    }
  }

  /** One per-user row per enrolled Sonarr instance, created from the master row on first sight. */
  private async getRollingMonitoredShows(
    session: PlexSession,
  ): Promise<RollingMonitoredShow[]> {
    try {
      const tvdbId = await this.getSeriesTvdbId(session)

      // Master entries (null plex_user_id) define which shows are enrolled.
      const { matchedBy, shows: globalShows } =
        await this.db.getRollingMonitoredShowMatches(
          tvdbId,
          session.grandparentTitle,
          undefined,
        )

      const titleNoticeKey = `title:${session.User.id}:${session.grandparentTitle}`
      if (matchedBy === 'ambiguousTitle') {
        this.notice(
          'warn',
          titleNoticeKey,
          `Not monitoring ${describeViewing(session.grandparentTitle, session)}: several rolling shows are titled "${session.grandparentTitle}" and the TVDB ids do not match, so none was picked`,
        )
        return []
      }

      if (globalShows.length === 0) {
        return []
      }

      if (matchedBy === 'title') {
        this.notice(
          'info',
          titleNoticeKey,
          `Matched ${describeViewing(globalShows[0].show_title, session)} to its rolling show by title because the TVDB ids differ or are missing`,
        )
      }

      // Key per-user rows by instance+series so each master resolves to its own.
      const { shows: userShows } = await this.db.getRollingMonitoredShowMatches(
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
      const sessionUuid = extractUuidFromThumb(session.User.thumb)

      for (const globalShow of globalShows) {
        const key = `${globalShow.sonarr_instance_id}-${globalShow.sonarr_series_id}`
        const existing = userShowByKey.get(key)

        if (existing) {
          // Cleanup matches other viewers by stored uuid/username, which go stale after a Plex account rename
          if (
            existing.plex_username !== session.User.title ||
            (sessionUuid && existing.plex_user_uuid !== sessionUuid)
          ) {
            await this.db.updateRollingShowUserIdentity(
              existing.id,
              session.User.title,
              sessionUuid,
            )
            existing.plex_username = session.User.title
            if (sessionUuid) existing.plex_user_uuid = sessionUuid
          }
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
              sessionUuid,
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
      throw error
    }
  }

  // Cleanup is gated on season advancement because Plex emits 'playing' every ~10s plus extras on each scrub/pause/resume.
  private async updateRollingShowProgress(
    rollingShow: RollingMonitoredShow,
    season: number,
    episode: number,
    canTriggerActions: boolean,
  ): Promise<void> {
    try {
      const priorRow = await this.db.getRollingMonitoredShowById(rollingShow.id)
      const priorSeason = priorRow?.last_watched_season ?? 0

      await this.db.updateRollingShowProgress(rollingShow.id, season, episode)

      if (
        !this.config.plexSessionMonitoring?.enableProgressiveCleanup ||
        !canTriggerActions
      ) {
        return
      }

      if (season <= priorSeason) {
        this.log.debug(
          `Not running progressive cleanup for ${rollingShow.show_title} (${rollingShow.plex_username}): ${episodeCode(season)} is not a new season`,
        )
        return
      }

      const updatedShow = await this.db.getRollingMonitoredShowById(
        rollingShow.id,
      )
      if (updatedShow) {
        await this.checkAndPerformProgressiveCleanup(updatedShow, season)
      }
    } catch (error) {
      this.log.error({ error }, 'Error updating rolling show progress:')
    }
  }

  // Monitors every episode explicitly because Sonarr only cascades season monitoring to episodes when the flag changes.
  private async monitorAndSearchSeason(
    sonarr: SonarrService,
    rollingShow: RollingMonitoredShow,
    session: PlexSession,
    result: SessionMonitoringResult,
    seasonNumber: number,
    update: RollingUpdate,
    successMessage: string,
  ): Promise<void> {
    const allEpisodes = await sonarr.getEpisodes(rollingShow.sonarr_series_id)
    const seasonEpisodes = allEpisodes.filter(
      (ep) => ep.seasonNumber === seasonNumber,
    )
    const unmonitoredInSeason = seasonEpisodes.filter((ep) => !ep.monitored)
    // Sonarr creates new episodes with their season's monitored flag, so an empty season is monitored ahead of them.
    const monitorsAhead =
      seasonEpisodes.length === 0 &&
      seasonNumber > rollingShow.current_monitored_season

    if (unmonitoredInSeason.length === 0 && !monitorsAhead) {
      const reason =
        seasonEpisodes.length > 0
          ? 'is already fully monitored'
          : 'has no episodes in Sonarr and is already monitored ahead of them'
      this.log.debug(
        `Not expanding ${describeViewing(rollingShow.show_title, session)}: ${episodeCode(seasonNumber)} ${reason}`,
      )
      return
    }

    await sonarr.updateSeasonMonitoring(
      rollingShow.sonarr_series_id,
      seasonNumber,
      true,
    )

    if (!monitorsAhead) {
      await sonarr.updateEpisodesMonitoring(
        unmonitoredInSeason.map((ep) => ({ id: ep.id, monitored: true })),
      )
      await sonarr.searchSeason(rollingShow.sonarr_series_id, seasonNumber)
      result.triggeredSearches++
    }

    // High-water mark, so watching an earlier season after skipping ahead never regresses it.
    if (seasonNumber > rollingShow.current_monitored_season) {
      await this.db.updateRollingShowMonitoredSeason(
        rollingShow.id,
        seasonNumber,
      )
    }

    result.rollingUpdates.push({
      showTitle: session.grandparentTitle,
      ...update,
    })

    this.log.info(
      monitorsAhead
        ? `Monitored ${episodeCode(seasonNumber)} of ${rollingShow.show_title} ahead of its episodes for ${session.User.title} because Sonarr has none to search yet`
        : successMessage,
    )
  }

  /** True when the expansion failed, which repeated E01 events retry because this path sits above the position gate. */
  private async expandPilotToFullSeason(
    rollingShow: RollingMonitoredShow,
    session: PlexSession,
    result: SessionMonitoringResult,
    seasonNumber: number,
  ): Promise<boolean> {
    try {
      const sonarr = this.sonarrManager.getSonarrService(
        rollingShow.sonarr_instance_id,
      )
      if (!sonarr) {
        this.notice(
          'warn',
          String(rollingShow.id),
          `Not expanding ${describeViewing(rollingShow.show_title, session)}: Sonarr instance ${rollingShow.sonarr_instance_id} not found`,
        )
        return true
      }

      await this.monitorAndSearchSeason(
        sonarr,
        rollingShow,
        session,
        result,
        seasonNumber,
        {
          action: 'expanded_to_season',
          details: `Pilot viewed - now searching for full Season ${seasonNumber}`,
        },
        `Expanded pilot monitoring for ${session.grandparentTitle} to search full Season ${seasonNumber}`,
      )
      return false
    } catch (error) {
      this.log.error(
        { error },
        `Failed to expand pilot monitoring for ${session.grandparentTitle}:`,
      )
      return true
    }
  }

  async createRollingMonitoredShow(
    sonarrSeriesId: number,
    sonarrInstanceId: number,
    tvdbId: string,
    showTitle: string,
    monitoringType: SonarrRollingMonitorOption,
  ): Promise<number> {
    try {
      return await this.db.createRollingMonitoredShow({
        sonarr_series_id: sonarrSeriesId,
        sonarr_instance_id: sonarrInstanceId,
        tvdb_id: tvdbId,
        show_title: showTitle,
        monitoring_type: monitoringType,
        current_monitored_season: ROLLING_BASELINE_SEASON[monitoringType],
      })
    } catch (error) {
      this.log.error({ error }, 'Error creating rolling monitored show:')
      throw error
    }
  }

  private async monitorAndSearchEpisodes(
    sonarr: SonarrService,
    episodes: SonarrEpisode[],
  ): Promise<void> {
    await sonarr.updateEpisodesMonitoring(
      episodes.map((ep) => ({ id: ep.id, monitored: true })),
    )
    await sonarr.searchEpisodes(episodes.map((ep) => ep.id))
  }

  /** Deletes the files of the given episodes and unmonitors the monitored ones. */
  private async removeEpisodes(
    sonarr: SonarrService,
    episodes: SonarrEpisode[],
  ): Promise<{ deleted: number; unmonitored: number }> {
    const fileIds = episodes
      .filter((ep) => ep.hasFile === true && ep.episodeFileId > 0)
      .map((ep) => ep.episodeFileId)
    const toUnmonitor = episodes
      .filter((ep) => ep.monitored === true)
      .map((ep) => ({ id: ep.id, monitored: false }))

    if (fileIds.length > 0) {
      await sonarr.deleteEpisodeFiles(fileIds)
    }
    if (toUnmonitor.length > 0) {
      await sonarr.updateEpisodesMonitoring(toUnmonitor)
    }

    return { deleted: fileIds.length, unmonitored: toUnmonitor.length }
  }

  /** Seeds E01 of every season at enrollment for an allSeasonPilotRolling show. */
  async monitorAllSeasonPilots(
    seriesId: number,
    instanceId: number,
  ): Promise<void> {
    try {
      const sonarr = this.requireSonarr(instanceId)

      // Sonarr's post-add refresh re-applies the addOptions monitor preset and clobbers earlier episode changes.
      await sonarr.waitForAddComplete(seriesId)

      await sonarr.updateSeriesMonitoring(seriesId, {
        monitored: true,
        monitorNewItems: 'none',
      })

      const allEpisodes = await sonarr.getEpisodes(seriesId)
      const pilots = allEpisodes.filter(isSeasonPilot)

      if (pilots.length === 0) {
        this.log.warn(`No pilot episodes found for series ${seriesId}`)
        return
      }

      await this.monitorAndSearchEpisodes(sonarr, pilots)

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

  /** Deletes files and unmonitors everything outside the show's monitoring-type baseline. */
  async resetShowToBaseline(show: RollingShowTarget): Promise<void> {
    const plan = BASELINE_PLANS[show.monitoring_type]
    try {
      const sonarr = this.requireSonarr(show.sonarr_instance_id)
      const allEpisodes = await sonarr.getEpisodes(show.sonarr_series_id)
      const kept = allEpisodes.filter(plan.keeps)

      if (plan.requiresKept && kept.length === 0) {
        throw new Error(
          `Pilot episode not found for series ${show.sonarr_series_id}`,
        )
      }

      const { deleted, unmonitored } = await this.removeEpisodes(
        sonarr,
        allEpisodes.filter((ep) => !plan.keeps(ep)),
      )

      const baselineSeason = ROLLING_BASELINE_SEASON[show.monitoring_type]
      const seasonsToUnmonitor = [
        ...new Set(allEpisodes.map((ep) => ep.seasonNumber)),
      ].filter((seasonNumber) => seasonNumber > baselineSeason)
      for (const seasonNumber of seasonsToUnmonitor) {
        await sonarr.updateSeasonMonitoring(
          show.sonarr_series_id,
          seasonNumber,
          false,
        )
      }

      const keptToMonitor = plan.monitorsKept
        ? kept.filter((ep) => !ep.monitored)
        : []
      if (keptToMonitor.length > 0) {
        await sonarr.updateEpisodesMonitoring(
          keptToMonitor.map((ep) => ({ id: ep.id, monitored: true })),
        )
      }

      this.log.info(
        `Reset ${show.show_title} to ${plan.label}: deleted ${deleted} episode files, unmonitored ${unmonitored} episodes and ${seasonsToUnmonitor.length} seasons`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Error resetting ${show.show_title} to ${plan.label}:`,
      )
      throw error
    }
  }

  /** Resets shows with no activity in inactivityDays and deletes their per-user rows. */
  async resetInactiveRollingShows(
    inactivityDays = PLEX_SESSION_MONITORING_DEFAULTS.inactivityResetDays,
  ): Promise<void> {
    try {
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
          await this.resetShowToBaseline(show)

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

  // Only allowed viewers active within the inactivity window protect a season, and the type's baseline is never removed.
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

      const inactivityDays =
        this.config.plexSessionMonitoring?.inactivityResetDays ??
        PLEX_SESSION_MONITORING_DEFAULTS.inactivityResetDays

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - inactivityDays)

      const isUserAllowed = await this.getAllowedUserMatcher()
      const allRollingShows = await this.db.getRollingMonitoredShows()
      const allUsersWatchingShow = allRollingShows.filter(
        (show) =>
          show.sonarr_series_id === rollingShow.sonarr_series_id &&
          show.sonarr_instance_id === rollingShow.sonarr_instance_id &&
          show.plex_user_id != null &&
          show.last_session_date != null &&
          new Date(show.last_session_date) >= cutoffDate &&
          isUserAllowed(
            show.plex_user_id || '',
            show.plex_username || '',
            show.plex_user_uuid,
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

      const startSeason =
        ROLLING_BASELINE_SEASON[rollingShow.monitoring_type] + 1
      // Never clean at or above the monitored high-water mark, and never beyond the season being watched.
      const maxSeasonToCheck = Math.min(
        currentSeason,
        rollingShow.current_monitored_season,
      )

      this.log.debug(
        `Progressive cleanup range (${rollingShow.monitoring_type}): ` +
          (maxSeasonToCheck <= startSeason
            ? 'no seasons eligible for cleanup'
            : `checking seasons ${startSeason} to ${maxSeasonToCheck - 1} (currentSeason: ${currentSeason}, monitored: ${rollingShow.current_monitored_season})`),
      )

      const seasonsToCleanup = collectSeasonsEligibleForCleanup(
        startSeason,
        maxSeasonToCheck,
        allUsersWatchingShow,
      )

      const protectedSeasons: string[] = []
      for (let season = startSeason; season < maxSeasonToCheck; season++) {
        if (!seasonsToCleanup.includes(season)) {
          protectedSeasons.push(episodeCode(season))
        }
      }
      if (protectedSeasons.length > 0) {
        this.log.debug(
          `Not cleaning ${protectedSeasons.join(', ')} of ${rollingShow.show_title}: an active viewer is on or just before each`,
        )
      }

      if (rollingShow.monitoring_type === 'pilotRolling' && currentSeason > 1) {
        const anyUserWatchingSeason1 = allUsersWatchingShow.some((show) =>
          userNeedsSeason(show, 1),
        )

        if (anyUserWatchingSeason1) {
          this.log.debug(
            `Not resetting ${episodeCode(1)} of ${rollingShow.show_title} to its pilot: an active viewer is still on ${episodeCode(1)}`,
          )
        } else {
          await this.resetSeasonToPilotOnly(rollingShow)
        }
      }

      if (seasonsToCleanup.length > 0) {
        this.log.info(
          `Progressive cleanup for ${rollingShow.show_title}: removing seasons ${seasonsToCleanup.join(', ')}`,
        )
        await this.cleanupSeasons(rollingShow, seasonsToCleanup)
      }
    } catch (error) {
      // Not rethrown, so a cleanup failure never breaks session processing.
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
    }
  }

  // An unmonitored non-pilot with a file still counts as pilot-only, so its file is kept.
  private async resetSeasonToPilotOnly(
    rollingShow: RollingMonitoredShow,
  ): Promise<void> {
    const { show_title: showTitle, sonarr_series_id: sonarrSeriesId } =
      rollingShow
    try {
      this.log.debug(
        `Starting Season 1 pilot reset for ${showTitle} (Sonarr series ${sonarrSeriesId})`,
      )

      const sonarr = this.requireSonarr(rollingShow.sonarr_instance_id)

      this.log.debug(`Fetching all episodes for series ${sonarrSeriesId}`)
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)
      this.log.debug(`Found ${allEpisodes.length} total episodes`)

      const pilotEpisode = allEpisodes.find(
        (ep) => ep.seasonNumber === 1 && ep.episodeNumber === 1,
      )

      if (!pilotEpisode) {
        this.log.warn(`Pilot episode not found for series ${sonarrSeriesId}`)
        return
      }

      const nonPilotEpisodes = allEpisodes.filter(
        (ep) => ep.seasonNumber === 1 && ep.id !== pilotEpisode.id,
      )

      if (
        pilotEpisode.monitored &&
        nonPilotEpisodes.every((ep) => !ep.monitored)
      ) {
        this.log.debug(
          `Not resetting ${episodeCode(1)} of ${showTitle} to its pilot: only the pilot is monitored already`,
        )
        return
      }

      const { deleted, unmonitored } = await this.removeEpisodes(
        sonarr,
        nonPilotEpisodes,
      )

      this.log.info(
        `Progressive cleanup: reset Season 1 of ${showTitle} back to pilot-only (deleted ${deleted} episode files, unmonitored ${unmonitored} episodes)`,
      )
    } catch (error) {
      this.log.error(
        { error },
        `Error resetting Season 1 to pilot-only for ${showTitle}:`,
      )
      throw error
    }
  }

  // allSeasonPilotRolling keeps each season's E01 monitored, the other types drop whole seasons.
  private async cleanupSeasons(
    rollingShow: RollingMonitoredShow,
    seasonsToCleanup: number[],
  ): Promise<void> {
    const { show_title: showTitle, sonarr_series_id: sonarrSeriesId } =
      rollingShow
    const keepPilots = rollingShow.monitoring_type === 'allSeasonPilotRolling'
    try {
      const sonarr = this.requireSonarr(rollingShow.sonarr_instance_id)
      const allEpisodes = await sonarr.getEpisodes(sonarrSeriesId)

      for (const seasonNumber of seasonsToCleanup) {
        const seasonEpisodes = allEpisodes.filter(
          (ep) => ep.seasonNumber === seasonNumber,
        )

        const { deleted, unmonitored } = await this.removeEpisodes(
          sonarr,
          keepPilots
            ? seasonEpisodes.filter((ep) => ep.episodeNumber > 1)
            : seasonEpisodes,
        )

        if (keepPilots) {
          const pilotEpisode = seasonEpisodes.find(
            (ep) => ep.episodeNumber === 1,
          )
          if (pilotEpisode && !pilotEpisode.monitored) {
            await sonarr.updateEpisodesMonitoring([
              { id: pilotEpisode.id, monitored: true },
            ])
          }
          this.log.info(
            `Progressive cleanup: reset season ${seasonNumber} of ${showTitle} to pilot-only (deleted ${deleted} episode files, unmonitored ${unmonitored} episodes)`,
          )
        } else {
          await sonarr.updateSeasonMonitoring(
            sonarrSeriesId,
            seasonNumber,
            false,
          )
          this.log.info(
            `Progressive cleanup: removed season ${seasonNumber} of ${showTitle} (deleted ${deleted} episode files, unmonitored ${unmonitored} episodes)`,
          )
        }
      }
    } catch (error) {
      this.log.error({ error }, `Error cleaning up seasons for ${showTitle}:`)
      throw error
    }
  }

  /** Monitors and searches E01s of seasons added since enrollment on allSeasonPilotRolling shows. */
  async syncNewSeasonPilots(): Promise<void> {
    try {
      const allShows = await this.db.getRollingMonitoredShows()

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
          const unmonitoredPilots = allEpisodes.filter(
            (ep) => isSeasonPilot(ep) && !ep.monitored,
          )

          if (unmonitoredPilots.length === 0) continue

          await this.monitorAndSearchEpisodes(sonarr, unmonitoredPilots)

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
