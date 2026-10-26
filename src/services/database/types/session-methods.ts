import type { SonarrRollingMonitorOption } from '@root/schemas/sonarr/season-monitoring.schema.js'
import type {
  NewRollingMonitoredShow,
  RollingMonitoredShow,
  RollingShowMatches,
  SeasonEpisodeCounts,
} from '@root/types/plex-session.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    createRollingMonitoredShow(data: NewRollingMonitoredShow): Promise<number>

    /** Race-safe through the unique (sonarr_series_id, sonarr_instance_id, plex_user_id) constraint, returns the new or existing row id. */
    createOrFindUserRollingMonitoredShow(
      globalShow: RollingMonitoredShow,
      plexUserId: string,
      plexUsername: string,
      plexUserUuid?: string | null,
    ): Promise<number>

    /** Leaves activity timestamps alone so an identity refresh never counts as viewing activity. */
    updateRollingShowUserIdentity(
      id: number,
      plexUsername: string,
      plexUserUuid: string | null,
    ): Promise<boolean>

    /** Empty on a database error. */
    getRollingMonitoredShows(): Promise<RollingMonitoredShow[]>

    /** Null when missing or on a database error. */
    getRollingMonitoredShowById(
      id: number,
    ): Promise<RollingMonitoredShow | null>

    /** Matches by tvdbId, else by normalized title, returning that viewer's rows or the master rows when plexUserId is omitted. */
    getRollingMonitoredShowMatches(
      tvdbId?: string,
      title?: string,
      plexUserId?: string,
    ): Promise<RollingShowMatches>

    /** Also stamps last_session_date, which inactivity reset and cleanup read as viewing activity. */
    updateRollingShowProgress(
      id: number,
      season: number,
      episode: number,
    ): Promise<boolean>

    /** False when the series has no master row on that instance or the write fails. */
    updateRollingShowSeasonEpisodeCounts(
      sonarrSeriesId: number,
      sonarrInstanceId: number,
      counts: SeasonEpisodeCounts,
    ): Promise<boolean>

    /** Raises the mark on that row and its master row, never lowering either, false when the row is missing or the write fails. */
    updateRollingShowMonitoredSeason(
      id: number,
      season: number,
    ): Promise<boolean>

    /** Deletes the master and every per-user row of the show that row id belongs to, 0 on error. */
    deleteAllRollingMonitoredShowEntries(id: number): Promise<number>

    /** Deletes the per-user rows and resets the master to its baseline season, returning the per-user rows deleted. */
    resetRollingMonitoredShowToOriginal(id: number): Promise<number>

    /** Matches either id because entries enrolled without a TVDB GUID store an empty tvdb_id. */
    deleteRollingMonitoredShowsByIds(
      tvdbIds: string[],
      sonarrSeriesIds: number[],
    ): Promise<number>

    /** One row per show (the master when present) whose master and per-user rows are all past the cutoff. */
    getInactiveRollingMonitoredShows(
      inactivityDays: number,
    ): Promise<RollingMonitoredShow[]>

    /** Writes the type to every row of the show but the season to the master only, false when id is not a master. */
    updateRollingShowMonitoringType(
      id: number,
      monitoringType: SonarrRollingMonitorOption,
      currentMonitoredSeason: number,
    ): Promise<boolean>
  }
}
