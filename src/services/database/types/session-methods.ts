import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'

declare module '@services/database.service.js' {
  interface DatabaseService {
    // PLEX SESSION MONITORING
    /**
     * Creates a new rolling monitored show entry
     * @param data - The rolling monitored show data
     * @returns Promise resolving to the created entry ID
     */
    createRollingMonitoredShow(data: {
      sonarr_series_id: number
      sonarr_instance_id: number
      tvdb_id?: string
      imdb_id?: string
      show_title: string
      monitoring_type: 'pilotRolling' | 'firstSeasonRolling'
      current_monitored_season: number
      plex_user_id?: string
      plex_username?: string
    }): Promise<number>

    /**
     * Gets all rolling monitored shows
     * @returns Promise resolving to array of rolling monitored shows
     */
    getRollingMonitoredShows(): Promise<RollingMonitoredShow[]>

    /**
     * Gets a rolling monitored show by ID
     * @param id - The rolling monitored show ID
     * @returns Promise resolving to the rolling monitored show or null
     */
    getRollingMonitoredShowById(
      id: number,
    ): Promise<RollingMonitoredShow | null>

    /**
     * Gets a rolling monitored show by TVDB ID or title for a specific user
     * @param tvdbId - The TVDB ID
     * @param title - The show title
     * @param plexUserId - The Plex user ID for per-user tracking
     * @returns Promise resolving to the rolling monitored show or null
     */
    getRollingMonitoredShow(
      tvdbId?: string,
      title?: string,
      plexUserId?: string,
    ): Promise<RollingMonitoredShow | null>

    /**
     * Updates rolling show progress
     * @param id - The rolling monitored show ID
     * @param season - The last watched season
     * @param episode - The last watched episode
     * @returns Promise resolving to boolean indicating success
     */
    updateRollingShowProgress(
      id: number,
      season: number,
      episode: number,
    ): Promise<boolean>

    /**
     * Updates the current monitored season for a rolling show
     * @param id - The rolling monitored show ID
     * @param season - The new current monitored season
     * @returns Promise resolving to boolean indicating success
     */
    updateRollingShowMonitoredSeason(
      id: number,
      season: number,
    ): Promise<boolean>

    /**
     * Deletes a rolling monitored show
     * @param id - The rolling monitored show ID
     * @returns Promise resolving to boolean indicating success
     */
    deleteRollingMonitoredShow(id: number): Promise<boolean>

    /**
     * Deletes all rolling monitored show entries for a given show
     * (all users watching the same sonarr_series_id + sonarr_instance_id)
     * @param id - The ID of any rolling monitored show entry for the show
     * @returns Promise resolving to number of deleted entries
     */
    deleteAllRollingMonitoredShowEntries(id: number): Promise<number>

    /**
     * Resets a rolling monitored show to its original state:
     * - Removes all user entries
     * - Resets master record to season 1
     * @param id - The ID of any rolling monitored show entry for the show
     * @returns Promise resolving to number of user entries deleted
     */
    resetRollingMonitoredShowToOriginal(id: number): Promise<number>

    /**
     * Gets rolling monitored shows that haven't been updated recently
     * @param inactivityDays - Number of days since last update to consider inactive
     * @returns Promise resolving to array of inactive rolling monitored shows
     */
    getInactiveRollingMonitoredShows(
      inactivityDays: number,
    ): Promise<RollingMonitoredShow[]>
  }
}
