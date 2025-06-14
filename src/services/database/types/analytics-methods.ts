declare module '@services/database.service.js' {
  interface DatabaseService {
    // ANALYTICS & STATISTICS
    /**
     * Analyzes watchlist items to find the most popular genres
     * @param limit - Maximum number of genres to return (default: 10)
     * @returns Promise resolving to array of genres with their occurrence counts
     */
    getTopGenres(limit?: number): Promise<{ genre: string; count: number }[]>

    /**
     * Gets the most watchlisted TV shows
     * @param limit - Maximum number of shows to return (default: 10)
     * @returns Promise resolving to array of shows with title, count, and thumbnail
     */
    getMostWatchlistedShows(
      limit?: number,
    ): Promise<{ title: string; count: number; thumb: string | null }[]>

    /**
     * Gets the most watchlisted movies
     * @param limit - Maximum number of movies to return (default: 10)
     * @returns Promise resolving to array of movies with title, count, and thumbnail
     */
    getMostWatchlistedMovies(
      limit?: number,
    ): Promise<{ title: string; count: number; thumb: string | null }[]>

    /**
     * Gets users with the most watchlist items
     * @param limit - Maximum number of users to return (default: 10)
     * @returns Promise resolving to array of users with name and item count
     */
    getUsersWithMostWatchlistItems(
      limit?: number,
    ): Promise<{ name: string; count: number }[]>

    /**
     * Gets the distribution of watchlist item statuses
     * @returns Promise resolving to array of statuses with their counts
     */
    getWatchlistStatusDistribution(): Promise<
      { status: string; count: number }[]
    >

    /**
     * Gets the distribution of content types in watchlist
     * @returns Promise resolving to array of content types with their counts
     */
    getContentTypeDistribution(): Promise<{ type: string; count: number }[]>

    /**
     * Gets recent activity statistics
     * @param days - Number of days to look back (default: 30)
     * @returns Promise resolving to object with activity statistics
     */
    getRecentActivityStats(days?: number): Promise<{
      new_watchlist_items: number
      status_changes: number
      notifications_sent: number
    }>

    /**
     * Gets activity statistics for Sonarr/Radarr instances
     * @returns Promise resolving to array of instance activity statistics
     */
    getInstanceActivityStats(): Promise<
      Array<{
        instance_id: number
        instance_type: 'sonarr' | 'radarr'
        name: string
        item_count: number
      }>
    >

    /**
     * Gets average time from grabbed to notified status
     * @returns Promise resolving to array of average time metrics by content type
     */
    getAverageTimeFromGrabbedToNotified(): Promise<
      Array<{
        content_type: string
        avg_days: number
        min_days: number
        max_days: number
        count: number
      }>
    >

    /**
     * Gets detailed metrics on status transitions
     * @returns Promise resolving to array of detailed status transition metrics
     */
    getDetailedStatusTransitionMetrics(): Promise<
      Array<{
        from_status: string
        to_status: string
        content_type: string
        avg_days: number
        min_days: number
        max_days: number
        count: number
      }>
    >

    /**
     * Gets average time from watchlist addition to notification
     * @returns Promise resolving to array of time-to-availability metrics by content type
     */
    getAverageTimeToAvailability(): Promise<
      Array<{
        content_type: string
        avg_days: number
        min_days: number
        max_days: number
        count: number
      }>
    >

    /**
     * Gets status flow data for visualization
     * @returns Promise resolving to array of status flow data points
     */
    getStatusFlowData(): Promise<
      Array<{
        from_status: string
        to_status: string
        content_type: string
        count: number
        avg_days: number
      }>
    >
  }
}
