declare module '../../database.service.js' {
  interface DatabaseService {
    // PLEX SESSION MONITORING
    /**
     * Creates a new rolling monitored show entry
     * @param data - Show data including instance, series, and monitoring information
     * @returns Promise resolving to the created rolling monitored show
     */
    createRollingMonitoredShow(data: { sonarr_instance_id: number, sonarr_series_id: number, title: string, monitored_season: number, original_monitored_season: number, user_name: string }): Promise<RollingMonitoredShow>

    /**
     * Retrieves all rolling monitored shows
     * @returns Promise resolving to array of all rolling monitored shows
     */
    getRollingMonitoredShows(): Promise<RollingMonitoredShow[]>

    /**
     * Retrieves a rolling monitored show by ID
     * @param id - ID of the rolling monitored show
     * @returns Promise resolving to the show if found, null otherwise
     */
    getRollingMonitoredShowById(id: number): Promise<RollingMonitoredShow | null>

    /**
     * Retrieves a rolling monitored show by instance and series ID
     * @param sonarrInstanceId - ID of the Sonarr instance
     * @param sonarrSeriesId - ID of the Sonarr series
     * @returns Promise resolving to the show if found, null otherwise
     */
    getRollingMonitoredShow(sonarrInstanceId: number, sonarrSeriesId: number): Promise<RollingMonitoredShow | null>

    /**
     * Updates the progress of a rolling monitored show
     * @param id - ID of the rolling monitored show
     * @param currentEpisode - Current episode number
     * @param currentSeason - Current season number
     * @returns Promise resolving to true if updated, false otherwise
     */
    updateRollingShowProgress(id: number, currentEpisode: number, currentSeason: number): Promise<boolean>

    /**
     * Updates the monitored season for a rolling monitored show
     * @param id - ID of the rolling monitored show
     * @param newMonitoredSeason - New season to monitor
     * @returns Promise resolving to true if updated, false otherwise
     */
    updateRollingShowMonitoredSeason(id: number, newMonitoredSeason: number): Promise<boolean>

    /**
     * Deletes a rolling monitored show
     * @param id - ID of the rolling monitored show to delete
     * @returns Promise resolving to true if deleted, false otherwise
     */
    deleteRollingMonitoredShow(id: number): Promise<boolean>

    /**
     * Deletes all rolling monitored show entries for a specific show
     * @param id - ID of the show to delete all entries for
     * @returns Promise resolving to number of entries deleted
     */
    deleteAllRollingMonitoredShowEntries(id: number): Promise<number>

    /**
     * Resets a rolling monitored show to its original monitored season
     * @param id - ID of the rolling monitored show to reset
     * @returns Promise resolving to number of shows reset
     */
    resetRollingMonitoredShowToOriginal(id: number): Promise<number>

    /**
     * Retrieves rolling monitored shows that have been inactive
     * @param inactiveDays - Number of days to consider as inactive
     * @returns Promise resolving to array of inactive rolling monitored shows
     */
    getInactiveRollingMonitoredShows(inactiveDays: number): Promise<RollingMonitoredShow[]>
  }
}